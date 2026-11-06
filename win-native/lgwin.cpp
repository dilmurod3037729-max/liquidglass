// lgwin.dll: istalgan oyna (HWND) ustiga jonli suyuq shisha qatlami (Windows, GPU).
// Orqa fon: DXGI Desktop Duplication (GPU teksturasi). Shisha: D3D11 pixel shader (core/shaders/liquidglass.frag ning HLSL porti, hlsl.inc).
// Chiqish: DirectComposition shaffof oyna, sichqonchaga o'tkazadi, target'ga egalik (owned) qiladi.
// Butun jarayon uchun BITTA render oqimi, BITTA qurilma va har monitor uchun BITTA duplication; har oyna uchun alohida swapchain.
#define NOMINMAX
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <dcomp.h>
#include <dwmapi.h>
#include <d3dcompiler.h>
#include <wrl/client.h>
#include <atomic>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

using Microsoft::WRL::ComPtr;

static const int MAX_SHAPES = 256;
static const int PAD = 128;   // sinish chetdan tashqariga olishi mumkin bo'lgan masofa (piksel)

#include "hlsl.inc"

struct GCB {
    float res[2], pad[2];
    float light[2], dpr, count;
    float ior, thick, bevel, disp;
    float blur, spec, absorb, merge;
    float shadowK, shadowOff, extraLod, debugComposite;
    float hasContent, rimOnly, frost, edge;
};
struct BCB { float dir[4]; };
struct MCB { float desk[4]; float hist[4][4]; };

// ───────── ommaviy holat (API oqimidan yoziladi, render oqimi o'qiydi) ─────────
struct Ov {
    HWND target = nullptr;
    float edgeSigma = 0;   // > 0: qirra refraksiyasi Gauss xira (piksel)
    ComPtr<ID3D11Texture2D> blurC, blurD; ComPtr<ID3D11ShaderResourceView> blurCSrv, blurDSrv; ComPtr<ID3D11RenderTargetView> blurCRtv, blurDRtv;
    float frostSigma = 0;   // > 0: popup ichki qismi Gauss bilan xiralashtiriladi (piksel)
    ComPtr<ID3D11Texture2D> blurA, blurB; ComPtr<ID3D11ShaderResourceView> blurASrv, blurBSrv; ComPtr<ID3D11RenderTargetView> blurARtv, blurBRtv;
    bool hold = false;   // popup: oyna ichki qismining orqa fon nusxasi yangilanmaydi (qirra bilan birga muzlatiladi)
    std::atomic<bool> lumaReq{false}; std::atomic<float> luma{0.5f}; ComPtr<ID3D11Texture2D> lumaStage;
    bool visible = false;   // true: oyna ekran suratidan yashirilmaydi; markazi shaffof, faqat qirra chiziladi, orqa fon nusxasida qirra egallagan joy yangilanmaydi
    POINT hist[4]{}; int nhist = 0; ULONGLONG histT = 0;
    bool under = false;   // true: shisha target OSTIDA (target shaffof va suratdan chiqarilgan, kontenti tiniq qoladi); false: shisha target USTIDA
    // API holati
    std::mutex mu;
    std::vector<float> shapes; int count = 0;
    float params[16] = { 1.55f, 40.f, 26.f, 0.04f, 0.35f, 1.1f, 0.2f, 1.f, 0.45f, 26.f, 0.7f, 1.f, 0, 0, 0, 0 };
    float lightX = 0, lightY = 0;
    std::vector<uint8_t> pendingContent; int pcW = 0, pcH = 0, pcStride = 0; bool contentNew = false;   // kontent: API oqimi yozadi, render oqimi yuklaydi
    std::atomic<bool> dirty{true}, stop{false}, done{false};
    std::wstring dumpPath; std::atomic<int> dumpDone{0}, dumpReq{0}; int dumpWhich = 0;   // 0 = oxirgi kadr, 1 = back (mip0), 2 = frost xira nusxa
    std::atomic<long> frames{0}, updates{0}; std::atomic<int> lastUs{0}; std::atomic<int> errStage{0}; std::atomic<long> errHr{0};
    // render oqimi holati
    ULONGLONG lastZFix = 0;
    HWND hwnd = nullptr; bool needBack = true; bool inited = false; int W = 0, H = 0; POINT last{ -99999, -99999 }; 
    ComPtr<IDXGISwapChain1> sc; ComPtr<IDCompositionTarget> tgt; ComPtr<IDCompositionVisual> vis;
    ComPtr<ID3D11RenderTargetView> rtv; ComPtr<ID3D11Texture2D> back; ComPtr<ID3D11ShaderResourceView> srv;
    ComPtr<ID3D11Texture2D> content; ComPtr<ID3D11ShaderResourceView> contentSrv; bool hasContent = false;
};

struct OutDup { ComPtr<IDXGIOutput1> out1; ComPtr<IDXGIOutputDuplication> dupl; RECT rc{}; ComPtr<ID3D11Texture2D> frame, desk, deskB;
                ComPtr<ID3D11ShaderResourceView> deskSrv, deskBSrv; ComPtr<ID3D11RenderTargetView> deskRtv, deskBRtv; bool fresh = false, echo = false, valid = false; ULONGLONG retryAt = 0; };   // desk: toza (shisha qirrasisiz) oxirgi kadr; deskB: yangilanayotgani   // desk: oxirgi to'liq kadr (ekran o'zgarmasa yangi kadr kelmaydi)

struct Shared {
    ComPtr<IDXGIFactory1> fac; LUID luid{}; bool haveDev = false;
    ComPtr<ID3D11Device> dev; ComPtr<ID3D11DeviceContext> ctx; ComPtr<IDCompositionDevice> dc;
    ComPtr<ID3D11VertexShader> vsh; ComPtr<ID3D11PixelShader> psh, pmask, pblur; ComPtr<ID3D11Buffer> gcb, scb, mcb, bcb; ComPtr<ID3D11SamplerState> samp, sampMip;
    std::vector<OutDup> outs;
    struct AnyOut { ComPtr<IDXGIOutput> out; LUID luid; RECT rc; };
    std::vector<AnyOut> all;   // tizimdagi barcha monitorlar (birinchi overlay yaratilganda sanaladi)
};

static std::mutex gMu;
static int gSelfPresents = 0;   // o'zimiz Present qilgan, lekin hali Desktop Duplication'da "aks-sado" sifatida qaytmagan kadrlar soni
static std::vector<Ov*> gPending, gActive;
static std::thread gThread; static std::atomic<bool> gRun{false};

// Windows 11 har bir yuqori darajadagi oynaga ingichka ramka, soya va yumaloq burchak chizadi: shisha o'zining shaklini o'zi chizadi, shuning uchun hammasini o'chiramiz
static void killChrome(HWND h) {
    DWORD none = 0xFFFFFFFE;   // DWMWA_COLOR_NONE
    DwmSetWindowAttribute(h, 34, &none, sizeof(none));          // DWMWA_BORDER_COLOR
    int off = 1;
    DwmSetWindowAttribute(h, 2, &off, sizeof(off));             // DWMWA_NCRENDERING_POLICY = DISABLED (soya yo'q)
    int dontRound = 1;
    DwmSetWindowAttribute(h, 33, &dontRound, sizeof(dontRound)); // DWMWA_WINDOW_CORNER_PREFERENCE = DONOTROUND
}
extern "C" __declspec(dllexport) void lg_kill_chrome(HWND h) { killChrome(h); }

static LRESULT CALLBACK wndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    if (m == WM_NCHITTEST) return HTTRANSPARENT;
    if (m == WM_MOUSEACTIVATE) return MA_NOACTIVATE;
    return DefWindowProcW(h, m, w, l);
}

static bool initDevice(Shared& S, IDXGIAdapter1* adapter) {
    D3D_FEATURE_LEVEL fl;
    if (FAILED(D3D11CreateDevice(adapter, D3D_DRIVER_TYPE_UNKNOWN, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, &S.dev, &fl, &S.ctx))) return false;
    DXGI_ADAPTER_DESC1 ad; adapter->GetDesc1(&ad); S.luid = ad.AdapterLuid;
    ComPtr<IDXGIDevice> dxgiDev; S.dev.As(&dxgiDev);
    if (FAILED(DCompositionCreateDevice(dxgiDev.Get(), IID_PPV_ARGS(&S.dc)))) return false;
    ComPtr<ID3DBlob> vsb, psb, err;
    if (FAILED(D3DCompile(kHlsl, std::strlen(kHlsl), "lg", nullptr, nullptr, "vs", "vs_5_0", 0, 0, &vsb, &err))) return false;
    if (FAILED(D3DCompile(kHlsl, std::strlen(kHlsl), "lg", nullptr, nullptr, "ps", "ps_5_0", D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &psb, &err))) {
        if (err) OutputDebugStringA((char*)err->GetBufferPointer());
        return false;
    }
    S.dev->CreateVertexShader(vsb->GetBufferPointer(), vsb->GetBufferSize(), nullptr, &S.vsh);
    S.dev->CreatePixelShader(psb->GetBufferPointer(), psb->GetBufferSize(), nullptr, &S.psh);
    ComPtr<ID3DBlob> mb;
    if (FAILED(D3DCompile(kHlsl, std::strlen(kHlsl), "lg", nullptr, nullptr, "psMask", "ps_5_0", D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &mb, &err))) {
        if (err) OutputDebugStringA((char*)err->GetBufferPointer());
        return false;
    }
    S.dev->CreatePixelShader(mb->GetBufferPointer(), mb->GetBufferSize(), nullptr, &S.pmask);
    ComPtr<ID3DBlob> bb2;
    if (FAILED(D3DCompile(kHlsl, std::strlen(kHlsl), "lg", nullptr, nullptr, "psBlur", "ps_5_0", D3DCOMPILE_OPTIMIZATION_LEVEL3, 0, &bb2, &err))) {
        if (err) OutputDebugStringA((char*)err->GetBufferPointer());
        return false;
    }
    S.dev->CreatePixelShader(bb2->GetBufferPointer(), bb2->GetBufferSize(), nullptr, &S.pblur);
    D3D11_BUFFER_DESC bd{}; bd.Usage = D3D11_USAGE_DEFAULT; bd.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
    bd.ByteWidth = (sizeof(GCB) + 15) & ~15; S.dev->CreateBuffer(&bd, nullptr, &S.gcb);
    bd.ByteWidth = MAX_SHAPES * 3 * 16; S.dev->CreateBuffer(&bd, nullptr, &S.scb);
    bd.ByteWidth = (sizeof(MCB) + 15) & ~15; S.dev->CreateBuffer(&bd, nullptr, &S.mcb);
    bd.ByteWidth = (sizeof(BCB) + 15) & ~15; S.dev->CreateBuffer(&bd, nullptr, &S.bcb);
    D3D11_SAMPLER_DESC smd{}; smd.Filter = D3D11_FILTER_ANISOTROPIC; smd.MaxAnisotropy = 8; smd.AddressU = smd.AddressV = smd.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
    S.dev->CreateSamplerState(&smd, &S.samp);
    D3D11_SAMPLER_DESC sm2{}; sm2.Filter = D3D11_FILTER_MIN_MAG_MIP_LINEAR; sm2.AddressU = sm2.AddressV = sm2.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP; sm2.MaxLOD = D3D11_FLOAT32_MAX;
    S.dev->CreateSamplerState(&sm2, &S.sampMip);
    S.haveDev = true;
    return true;
}

static bool rectHit(const RECT& a, long x0, long y0, long x1, long y1) { return a.left < x1 && a.right > x0 && a.top < y1 && a.bottom > y0; }

// Oyna (+PAD) kesishgan BARCHA monitorlarni duplication'ga ulaymiz: oyna ikki monitor orasida tursa ham orqa fon to'liq bo'ladi, qayta qurish kerak emas.
static void ensureOuts(Shared& S, long ox, long oy, int w, int h) {
    if (S.all.empty()) {
        ComPtr<IDXGIAdapter1> ad;
        for (UINT a = 0; S.fac->EnumAdapters1(a, &ad) == S_OK; a++) {
            DXGI_ADAPTER_DESC1 d; ad->GetDesc1(&d);
            ComPtr<IDXGIOutput> oo;
            for (UINT k = 0; ad->EnumOutputs(k, &oo) == S_OK; k++) {
                DXGI_OUTPUT_DESC od; oo->GetDesc(&od);
                S.all.push_back({ oo, d.AdapterLuid, od.DesktopCoordinates });
            }
        }
    }
    for (auto& a : S.all) {
        if (!rectHit(a.rc, ox - PAD, oy - PAD, ox + w + PAD, oy + h + PAD)) continue;
        if (a.luid.LowPart != S.luid.LowPart || a.luid.HighPart != S.luid.HighPart) continue;   // boshqa GPU: hozircha qo'llab-quvvatlanmaydi
        bool have = false; for (auto& od : S.outs) if (EqualRect(&od.rc, &a.rc)) have = true;
        if (have) continue;
        OutDup od; od.rc = a.rc; a.out.As(&od.out1);
        if (!od.out1 || FAILED(od.out1->DuplicateOutput(S.dev.Get(), &od.dupl))) continue;
        D3D11_TEXTURE2D_DESC dd{}; dd.Width = a.rc.right - a.rc.left; dd.Height = a.rc.bottom - a.rc.top; dd.MipLevels = 1; dd.ArraySize = 1; dd.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
        dd.SampleDesc.Count = 1; dd.Usage = D3D11_USAGE_DEFAULT; dd.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
        if (FAILED(S.dev->CreateTexture2D(&dd, nullptr, &od.desk)) || FAILED(S.dev->CreateTexture2D(&dd, nullptr, &od.deskB))) continue;
        S.dev->CreateShaderResourceView(od.desk.Get(), nullptr, &od.deskSrv); S.dev->CreateShaderResourceView(od.deskB.Get(), nullptr, &od.deskBSrv);
        S.dev->CreateRenderTargetView(od.desk.Get(), nullptr, &od.deskRtv); S.dev->CreateRenderTargetView(od.deskB.Get(), nullptr, &od.deskBRtv);
        S.outs.push_back(od);
    }
}

// Oyna markazi turgan monitor orqali qurilma tanlanadi; oyna ostidagi hamma monitorlar duplication'ga ulanadi. Xato bosqichi qaytariladi (0 = yaxshi).
static int setupOverlay(Shared& S, Ov* o, POINT origin, int w, int h, HRESULT& hr) {
    if (!S.fac && FAILED(hr = CreateDXGIFactory1(IID_PPV_ARGS(&S.fac)))) return 1;
    if (!S.haveDev) {
        ComPtr<IDXGIAdapter1> adapter; bool found = false;
        POINT c = { origin.x + w / 2, origin.y + h / 2 };
        for (UINT a = 0; !found && S.fac->EnumAdapters1(a, &adapter) == S_OK; a++) {
            ComPtr<IDXGIOutput> oo;
            for (UINT k = 0; adapter->EnumOutputs(k, &oo) == S_OK; k++) {
                DXGI_OUTPUT_DESC od; oo->GetDesc(&od);
                if (PtInRect(&od.DesktopCoordinates, c)) { found = true; break; }
            }
        }
        if (!found) { hr = E_FAIL; return 2; }
        if (!initDevice(S, adapter.Get())) { hr = E_FAIL; return 3; }
    }
    ensureOuts(S, origin.x, origin.y, w, h);
    bool any = false; for (auto& od : S.outs) if (rectHit(od.rc, origin.x, origin.y, origin.x + w, origin.y + h)) any = true;
    if (!any) { hr = E_FAIL; return 4; }
    ComPtr<IDXGIFactory2> fac2; S.fac.As(&fac2);
    DXGI_SWAP_CHAIN_DESC1 sd{}; sd.Width = w; sd.Height = h; sd.Format = DXGI_FORMAT_B8G8R8A8_UNORM; sd.SampleDesc.Count = 1;
    sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT; sd.BufferCount = 2; sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL; sd.AlphaMode = DXGI_ALPHA_MODE_PREMULTIPLIED;
    if (FAILED(hr = fac2->CreateSwapChainForComposition(S.dev.Get(), &sd, nullptr, &o->sc))) return 5;
    if (FAILED(hr = S.dc->CreateTargetForHwnd(o->hwnd, TRUE, &o->tgt))) return 7;
    S.dc->CreateVisual(&o->vis); o->vis->SetContent(o->sc.Get()); o->tgt->SetRoot(o->vis.Get()); S.dc->Commit();
    ComPtr<ID3D11Texture2D> bb; o->sc->GetBuffer(0, IID_PPV_ARGS(&bb)); S.dev->CreateRenderTargetView(bb.Get(), nullptr, &o->rtv);
    D3D11_TEXTURE2D_DESC td{}; td.Width = w + 2 * PAD; td.Height = h + 2 * PAD; td.MipLevels = 0; td.ArraySize = 1; td.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    td.SampleDesc.Count = 1; td.Usage = D3D11_USAGE_DEFAULT; td.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET; td.MiscFlags = D3D11_RESOURCE_MISC_GENERATE_MIPS;
    if (FAILED(hr = S.dev->CreateTexture2D(&td, nullptr, &o->back))) return 8;
    S.dev->CreateShaderResourceView(o->back.Get(), nullptr, &o->srv);
    o->W = w; o->H = h; o->inited = true; o->dirty = true; o->needBack = true;
    return 0;
}

static void releaseOverlayGpu(Ov* o) {
    o->content.Reset(); o->contentSrv.Reset(); o->hasContent = false; o->lumaStage.Reset();
    o->blurA.Reset(); o->blurB.Reset(); o->blurASrv.Reset(); o->blurBSrv.Reset(); o->blurARtv.Reset(); o->blurBRtv.Reset();
    o->blurC.Reset(); o->blurD.Reset(); o->blurCSrv.Reset(); o->blurDSrv.Reset(); o->blurCRtv.Reset(); o->blurDRtv.Reset();
    o->rtv.Reset(); o->srv.Reset(); o->back.Reset(); o->vis.Reset(); o->tgt.Reset(); o->sc.Reset(); o->inited = false; }

static void saveBmp(const wchar_t* path, const uint8_t* bgra, int w, int h, int pitch) {
    FILE* f = _wfopen(path, L"wb"); if (!f) return;
    BITMAPFILEHEADER fh{}; BITMAPINFOHEADER ih{};
    ih.biSize = sizeof(ih); ih.biWidth = w; ih.biHeight = -h; ih.biPlanes = 1; ih.biBitCount = 32; ih.biCompression = BI_RGB;
    fh.bfType = 0x4D42; fh.bfOffBits = sizeof(fh) + sizeof(ih); fh.bfSize = fh.bfOffBits + w * h * 4;
    std::fwrite(&fh, sizeof(fh), 1, f); std::fwrite(&ih, sizeof(ih), 1, f);
    for (int y = 0; y < h; y++) std::fwrite(bgra + (size_t)y * pitch, 4, w, f);
    std::fclose(f);
}

static void uploadConstants(Shared& S, Ov* o, bool debug) {
    GCB cb{}; std::vector<float> sh; int n;
    {
        std::lock_guard<std::mutex> lk(o->mu);
        sh = o->shapes; n = o->count;
        cb.light[0] = o->lightX; cb.light[1] = o->lightY;
        const float* p = o->params;
        cb.ior = p[0]; cb.thick = p[1]; cb.bevel = p[2]; cb.disp = p[3]; cb.blur = p[4]; cb.spec = p[5]; cb.absorb = p[6]; cb.merge = p[7];
        cb.shadowK = p[8]; cb.shadowOff = p[9]; cb.extraLod = p[10]; cb.dpr = p[11];
    }
    n = std::min(n, MAX_SHAPES);
    {   // yangi kontent bo'lsa teksturaga yuklaymiz (o'lchami oyna bilan bir xil bo'lishi kerak)
        std::lock_guard<std::mutex> lk(o->mu);
        if (o->contentNew && o->pcW == o->W && o->pcH == o->H && !o->pendingContent.empty()) {
            if (!o->content) {
                D3D11_TEXTURE2D_DESC cd{}; cd.Width = o->W; cd.Height = o->H; cd.MipLevels = 1; cd.ArraySize = 1; cd.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
                cd.SampleDesc.Count = 1; cd.Usage = D3D11_USAGE_DEFAULT; cd.BindFlags = D3D11_BIND_SHADER_RESOURCE;
                if (SUCCEEDED(S.dev->CreateTexture2D(&cd, nullptr, &o->content))) S.dev->CreateShaderResourceView(o->content.Get(), nullptr, &o->contentSrv);
            }
            if (o->content) { S.ctx->UpdateSubresource(o->content.Get(), 0, nullptr, o->pendingContent.data(), o->pcStride, 0); o->hasContent = true; }
            o->contentNew = false;
        }
    }
    cb.hasContent = o->hasContent ? 1.f : 0.f; cb.rimOnly = o->visible ? 1.f : 0.f; cb.frost = (o->frostSigma > 0 && o->blurB) ? 1.f : 0.f; cb.edge = (o->edgeSigma > 0 && o->blurD) ? 1.f : 0.f;
    cb.res[0] = (float)o->W; cb.res[1] = (float)o->H; cb.pad[0] = cb.pad[1] = (float)PAD; cb.count = (float)n; cb.debugComposite = debug ? 1.f : 0.f; if (debug && std::getenv("LG_DBG")) cb.debugComposite = (float)std::atoi(std::getenv("LG_DBG"));
    S.ctx->UpdateSubresource(S.gcb.Get(), 0, nullptr, &cb, 0, 0);
    sh.resize((size_t)MAX_SHAPES * 12, 0.f);   // doimiy buferni faqat to'liq yangilash mumkin
    S.ctx->UpdateSubresource(S.scb.Get(), 0, nullptr, sh.data(), 0, 0);
}

static void render(Shared& S, Ov* o, bool debug) {
    uploadConstants(S, o, debug);
    D3D11_VIEWPORT vp{ 0, 0, (float)o->W, (float)o->H, 0, 1 };
    S.ctx->RSSetViewports(1, &vp);
    ID3D11RenderTargetView* rt = o->rtv.Get(); S.ctx->OMSetRenderTargets(1, &rt, nullptr);
    S.ctx->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    S.ctx->VSSetShader(S.vsh.Get(), nullptr, 0); S.ctx->PSSetShader(S.psh.Get(), nullptr, 0);
    ID3D11Buffer* cbs[2] = { S.gcb.Get(), S.scb.Get() }; S.ctx->PSSetConstantBuffers(0, 2, cbs);
    ID3D11ShaderResourceView* svs[4] = { o->srv.Get(), o->hasContent ? o->contentSrv.Get() : nullptr, o->blurB ? o->blurBSrv.Get() : nullptr, o->blurD ? o->blurDSrv.Get() : nullptr }; S.ctx->PSSetShaderResources(0, 4, svs);
    ID3D11SamplerState* ss2[2] = { S.samp.Get(), S.sampMip.Get() }; S.ctx->PSSetSamplers(0, 2, ss2);
    S.ctx->Draw(3, 0);
}

static void dumpBackbuffer(Shared& S, Ov* o) {
    ComPtr<ID3D11Texture2D> cur;
    if (o->dumpWhich == 1) cur = o->back; else if (o->dumpWhich == 2) cur = o->blurB; else o->sc->GetBuffer(0, IID_PPV_ARGS(&cur));
    if (!cur) return;
    D3D11_TEXTURE2D_DESC d; cur->GetDesc(&d); d.Usage = D3D11_USAGE_STAGING; d.BindFlags = 0; d.CPUAccessFlags = D3D11_CPU_ACCESS_READ; d.MiscFlags = 0;
    ComPtr<ID3D11Texture2D> st; if (FAILED(S.dev->CreateTexture2D(&d, nullptr, &st))) return;
    S.ctx->CopyResource(st.Get(), cur.Get());
    D3D11_MAPPED_SUBRESOURCE mp;
    if (SUCCEEDED(S.ctx->Map(st.Get(), 0, D3D11_MAP_READ, 0, &mp))) {
        if (o->dumpWhich == 3) {   // alfa xaritasi: qaysi piksellar shaffof (haqiqiy ish stoli ko'rinadi)
            std::vector<uint8_t> g((size_t)d.Width * d.Height * 4);
            for (UINT y = 0; y < d.Height; y++) for (UINT x = 0; x < d.Width; x++) { uint8_t al = ((const uint8_t*)mp.pData)[(size_t)y * mp.RowPitch + x * 4 + 3]; size_t k = ((size_t)y * d.Width + x) * 4; g[k] = g[k + 1] = g[k + 2] = al; g[k + 3] = 255; }
            saveBmp(o->dumpPath.c_str(), g.data(), d.Width, d.Height, d.Width * 4);
        } else saveBmp(o->dumpPath.c_str(), (const uint8_t*)mp.pData, d.Width, d.Height, mp.RowPitch);
        S.ctx->Unmap(st.Get(), 0);
    }
}

// Orqa fonning Gauss xiralashtirilgani: ikki o'tish, faqat orqa fon yangilanganda. Ikki zanjir: markaz (frost) va qirra (edge).
static void blurChain(Shared& S, Ov* o, float sigma, ComPtr<ID3D11Texture2D>& A, ComPtr<ID3D11Texture2D>& B, ComPtr<ID3D11ShaderResourceView>& As,
                      ComPtr<ID3D11ShaderResourceView>& Bs, ComPtr<ID3D11RenderTargetView>& Ar, ComPtr<ID3D11RenderTargetView>& Br) {
    if (sigma <= 0 || !o->back || !S.pblur) return;
    int BW = o->W + 2 * PAD, BH = o->H + 2 * PAD;
    if (!A) {
        D3D11_TEXTURE2D_DESC td{}; td.Width = BW; td.Height = BH; td.MipLevels = 1; td.ArraySize = 1; td.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
        td.SampleDesc.Count = 1; td.Usage = D3D11_USAGE_DEFAULT; td.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
        if (FAILED(S.dev->CreateTexture2D(&td, nullptr, &A)) || FAILED(S.dev->CreateTexture2D(&td, nullptr, &B))) { A.Reset(); B.Reset(); return; }
        S.dev->CreateShaderResourceView(A.Get(), nullptr, &As); S.dev->CreateShaderResourceView(B.Get(), nullptr, &Bs);
        S.dev->CreateRenderTargetView(A.Get(), nullptr, &Ar); S.dev->CreateRenderTargetView(B.Get(), nullptr, &Br);
    }
    D3D11_VIEWPORT vp{ 0, 0, (float)BW, (float)BH, 0, 1 };
    S.ctx->RSSetViewports(1, &vp);
    S.ctx->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    S.ctx->VSSetShader(S.vsh.Get(), nullptr, 0); S.ctx->PSSetShader(S.pblur.Get(), nullptr, 0);
    ID3D11SamplerState* ss = S.samp.Get(); S.ctx->PSSetSamplers(0, 1, &ss);
    ID3D11Buffer* cb3 = S.bcb.Get(); S.ctx->PSSetConstantBuffers(3, 1, &cb3);
    auto pass = [&](ID3D11ShaderResourceView* src, ID3D11RenderTargetView* dst, float dx, float dy) {
        BCB b{}; b.dir[0] = dx; b.dir[1] = dy; b.dir[2] = sigma;
        S.ctx->UpdateSubresource(S.bcb.Get(), 0, nullptr, &b, 0, 0);
        S.ctx->OMSetRenderTargets(1, &dst, nullptr);
        S.ctx->PSSetShaderResources(0, 1, &src);
        S.ctx->Draw(3, 0);
        ID3D11ShaderResourceView* nul = nullptr; S.ctx->PSSetShaderResources(0, 1, &nul);
    };
    pass(o->srv.Get(), Ar.Get(), 1.f, 0.f);
    pass(As.Get(), Br.Get(), 0.f, 1.f);
    ID3D11RenderTargetView* nrt = nullptr; S.ctx->OMSetRenderTargets(1, &nrt, nullptr);
}

static void blurBack(Shared& S, Ov* o) {
    blurChain(S, o, o->frostSigma, o->blurA, o->blurB, o->blurASrv, o->blurBSrv, o->blurARtv, o->blurBRtv);
    blurChain(S, o, o->edgeSigma, o->blurC, o->blurD, o->blurCSrv, o->blurDSrv, o->blurCRtv, o->blurDRtv);
}

// Oyna (+PAD) ostidagi orqa fonni barcha monitorlarning oxirgi to'liq kadridan (desk) yig'adi (mip zanjiri bilan).
static void copyBack(Shared& S, Ov* o) {
    long x0 = o->last.x - PAD, y0 = o->last.y - PAD; int BW = o->W + 2 * PAD, BH = o->H + 2 * PAD;
    for (auto& od : S.outs) {
        if (!od.valid || !od.desk) continue;
        long L = std::max<long>(x0, od.rc.left), T = std::max<long>(y0, od.rc.top), R = std::min<long>(x0 + BW, od.rc.right), B = std::min<long>(y0 + BH, od.rc.bottom);
        if (R <= L || B <= T) continue;
        D3D11_BOX box{ (UINT)(L - od.rc.left), (UINT)(T - od.rc.top), 0, (UINT)(R - od.rc.left), (UINT)(B - od.rc.top), 1 };
        S.ctx->CopySubresourceRegion(o->back.Get(), 0, (UINT)(L - x0), (UINT)(T - y0), 0, od.desk.Get(), 0, &box);
    }
    S.ctx->GenerateMips(o->srv.Get());
    blurBack(S, o);
}

// Oyna ichki maydonining joriy o'rniga mos orqa fonni oxirgi kadrlardan olib, shishani chizadi va ko'rsatadi.
// Ko'rinadigan rejimda orqa fon nusxasi (oyna ostidagi monitor kadri) tayyor bo'lmaguncha shisha CHIZILMAYDI: aks holda birinchi kadrga shishaning
// o'zi tushib, muzlatilgan nusxani buzadi (oyna ichida o'z matnining ko'chirmasi, qora markaz).
static bool backReady(Shared& S, Ov* o) {
    if (!o->visible) return true;
    for (auto& od : S.outs) if (od.valid && rectHit(od.rc, o->last.x - PAD, o->last.y - PAD, o->last.x + o->W + PAD, o->last.y + o->H + PAD)) return true;
    return false;
}

static bool backAndPresent(Shared& S, Ov* o) {
    if (!o->inited || !backReady(S, o)) return false;
    copyBack(S, o);
    o->updates++; o->needBack = false; o->dirty = false;
    LARGE_INTEGER t0, t1, fq; QueryPerformanceFrequency(&fq); QueryPerformanceCounter(&t0);
    render(S, o, false);
    o->sc->Present(0, 0); gSelfPresents = std::min(gSelfPresents + 1, 4);
    QueryPerformanceCounter(&t1);
    o->lastUs = (int)((t1.QuadPart - t0.QuadPart) * 1000000 / fq.QuadPart);
    o->frames++;
    return true;
}

// Yangi monitor kadri (deskB) ustiga: shisha qirrasi egallagan joylarda eski toza qiymat (desk) qaytariladi.
static void maskPass(Shared& S, Ov* q, OutDup& od) {
    uploadConstants(S, q, false);
    MCB m{}; m.desk[0] = (float)od.rc.left; m.desk[1] = (float)od.rc.top; m.desk[2] = (float)std::min(q->nhist, 4); m.desk[3] = q->hold ? 1.f : 0.f;
    for (int k = 0; k < std::min(q->nhist, 4); k++) { m.hist[k][0] = (float)q->hist[k].x; m.hist[k][1] = (float)q->hist[k].y; }
    S.ctx->UpdateSubresource(S.mcb.Get(), 0, nullptr, &m, 0, 0);
    long x0 = std::max<long>(q->last.x - PAD - od.rc.left, 0), y0 = std::max<long>(q->last.y - PAD - od.rc.top, 0);
    long x1 = std::min<long>(q->last.x + q->W + PAD - od.rc.left, od.rc.right - od.rc.left), y1 = std::min<long>(q->last.y + q->H + PAD - od.rc.top, od.rc.bottom - od.rc.top);
    if (x1 <= x0 || y1 <= y0) return;
    D3D11_VIEWPORT vp{ (float)x0, (float)y0, (float)(x1 - x0), (float)(y1 - y0), 0, 1 };
    S.ctx->RSSetViewports(1, &vp);
    ID3D11RenderTargetView* rt = od.deskBRtv.Get(); S.ctx->OMSetRenderTargets(1, &rt, nullptr);
    S.ctx->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    S.ctx->VSSetShader(S.vsh.Get(), nullptr, 0); S.ctx->PSSetShader(S.pmask.Get(), nullptr, 0);
    ID3D11Buffer* cbs[3] = { S.gcb.Get(), S.scb.Get(), S.mcb.Get() }; S.ctx->PSSetConstantBuffers(0, 3, cbs);
    ID3D11ShaderResourceView* sv = od.deskSrv.Get(); S.ctx->PSSetShaderResources(0, 1, &sv);
    S.ctx->Draw(3, 0);
    ID3D11ShaderResourceView* nul = nullptr; S.ctx->PSSetShaderResources(0, 1, &nul);   // desk keyingi o'tishda yozish nishoni bo'lishi mumkin
    ID3D11RenderTargetView* nrt = nullptr; S.ctx->OMSetRenderTargets(1, &nrt, nullptr);
}

// Orqa fon yorqinligi (0..1): back teksturasining oxirgi mip darajasi (butun oyna + chet o'rtachasi). Python matn rangini shunga moslaydi.
static void probeLuma(Shared& S, Ov* o) {
    if (!o->inited || !o->back) return;
    D3D11_TEXTURE2D_DESC bd; o->back->GetDesc(&bd);
    if (!o->lumaStage) {
        D3D11_TEXTURE2D_DESC sd{}; sd.Width = 1; sd.Height = 1; sd.MipLevels = 1; sd.ArraySize = 1; sd.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
        sd.SampleDesc.Count = 1; sd.Usage = D3D11_USAGE_STAGING; sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        if (FAILED(S.dev->CreateTexture2D(&sd, nullptr, &o->lumaStage))) return;
    }
    S.ctx->CopySubresourceRegion(o->lumaStage.Get(), 0, 0, 0, 0, o->back.Get(), bd.MipLevels - 1, nullptr);
    D3D11_MAPPED_SUBRESOURCE mp;
    if (SUCCEEDED(S.ctx->Map(o->lumaStage.Get(), 0, D3D11_MAP_READ, 0, &mp))) {
        const uint8_t* px = (const uint8_t*)mp.pData;   // BGRA
        o->luma = (0.299f * px[2] + 0.587f * px[1] + 0.114f * px[0]) / 255.f;
        S.ctx->Unmap(o->lumaStage.Get(), 0);
    }
}

static ULONGLONG gLastMove = 0;

// Skrinshot rejimi: PrtScn / Win+Shift+S bosilganda ~3 soniya shisha oynalari ekran suratiga tushadi (odatda WDA_EXCLUDEFROMCAPTURE ularni yashiradi).
// Shu vaqtda orqa fon muzlatiladi (aks holda shisha o'zini suratga olib qayta aloqa bo'ladi).
static std::atomic<ULONGLONG> gCaptureUntil{0};
static bool gAffVisible = false;
static void setAffinityAll(bool visible) {
    std::vector<Ov*> ovs; { std::lock_guard<std::mutex> lk(gMu); ovs = gActive; }
    DWORD a = visible ? 0 : 0x11;
    for (Ov* o : ovs) {
        if (o->done || o->visible) continue;
        if (o->hwnd) SetWindowDisplayAffinity(o->hwnd, a);
        if (o->under && IsWindow(o->target)) SetWindowDisplayAffinity(o->target, a);
    }
}
static LRESULT CALLBACK kbHook(int code, WPARAM wp, LPARAM lp) {
    if (code == HC_ACTION && (wp == WM_KEYDOWN || wp == WM_SYSKEYDOWN)) {
        const KBDLLHOOKSTRUCT* k = (const KBDLLHOOKSTRUCT*)lp;
        bool win = ((GetAsyncKeyState(VK_LWIN) | GetAsyncKeyState(VK_RWIN)) & 0x8000) != 0, shift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
        if (k->vkCode == VK_SNAPSHOT || (k->vkCode == 'S' && win && shift)) {
            gCaptureUntil = GetTickCount64() + 3000;
            if (!gAffVisible) { gAffVisible = true; setAffinityAll(true); }
        }
    }
    return CallNextHookEx(nullptr, code, wp, lp);
}   // oxirgi oyna siljishi vaqti: shu paytda kutishni qisqartiramiz

static void teardown(Ov* o) {
    releaseOverlayGpu(o);
    if (o->hwnd) { DestroyWindow(o->hwnd); o->hwnd = nullptr; }
    o->done = true;
}

static void worker() {
    SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    WNDCLASSW wc{}; wc.lpfnWndProc = wndProc; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"LGWinOverlay";
    RegisterClassW(&wc);
    Shared S;
    HHOOK hook = std::getenv("LG_NO_HOOK") ? nullptr : SetWindowsHookExW(WH_KEYBOARD_LL, kbHook, GetModuleHandleW(nullptr), 0);
    while (gRun) {
        MSG msg; while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
        {
            bool wantVisible = GetTickCount64() < gCaptureUntil;
            if (wantVisible != gAffVisible) {
                gAffVisible = wantVisible; setAffinityAll(wantVisible);
                if (!wantVisible) { std::lock_guard<std::mutex> lk(gMu); for (Ov* o : gActive) o->needBack = true; }   // muzlatish tugadi: orqa fonni yangilaymiz
            }
        }
        std::vector<Ov*> ovs;
        {
            std::lock_guard<std::mutex> lk(gMu);
            for (Ov* o : gPending) gActive.push_back(o);
            gPending.clear();
            ovs = gActive;
        }
        std::vector<Ov*> alive;
        for (Ov* o : ovs) {
            if (o->done) continue;
            if (o->stop || !IsWindow(o->target)) { teardown(o); continue; }
            if (!o->hwnd) {
                o->hwnd = CreateWindowExW(WS_EX_NOREDIRECTIONBITMAP | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE,
                                          L"LGWinOverlay", L"lg", WS_POPUP, 0, 0, 16, 16, o->under ? nullptr : o->target, nullptr, wc.hInstance, nullptr);
                if (o->under && !o->visible && !std::getenv("LG_VISIBLE")) SetWindowDisplayAffinity(o->target, 0x11);   // target ham suratdan chiqariladi: orqa fon faqat uning ortidagi narsa
                killChrome(o->hwnd);
                SetLayeredWindowAttributes(o->hwnd, 0, 255, LWA_ALPHA);   // layered + transparent: sichqoncha va klaviatura ostidagi ilovaga o'tadi (boshqa oqim uchun HTTRANSPARENT yetmaydi)
                if (!o->visible && !std::getenv("LG_VISIBLE")) SetWindowDisplayAffinity(o->hwnd, 0x11);   // LG_VISIBLE=1 faqat bir martalik ekran surati uchun (qayta aloqa bo'ladi)
                // suratga olmaymiz: qayta aloqa yo'q
            }
            RECT cr{}; GetClientRect(o->target, &cr); POINT org{ 0, 0 }; ClientToScreen(o->target, &org);
            int W = cr.right, H = cr.bottom;
            bool vis = IsWindowVisible(o->target) && !IsIconic(o->target) && W > 0 && H > 0;
            if (!vis) { if (o->inited) { ShowWindow(o->hwnd, SW_HIDE); releaseOverlayGpu(o); } continue; }
            if (!o->inited || W != o->W || H != o->H) {
                releaseOverlayGpu(o);
                SetWindowPos(o->hwnd, nullptr, org.x, org.y, W, H, SWP_NOACTIVATE | SWP_NOZORDER);
                HRESULT hr = S_OK; int st = setupOverlay(S, o, org, W, H, hr);
                if (st) { o->errStage = st; o->errHr = (long)hr; releaseOverlayGpu(o); continue; }
                o->last = { -99999, -99999 };
                ShowWindow(o->hwnd, SW_SHOWNOACTIVATE);
            }
            if (org.x != o->last.x || org.y != o->last.y) {
                ensureOuts(S, org.x, org.y, W, H);   // boshqa monitorga o'tsa ham qatlam qayta qurilmaydi: yangi monitor duplication'ga ulanadi, orqa fon hammasidan yig'iladi
                for (int k = 3; k > 0; k--) o->hist[k] = o->hist[k - 1];
                o->hist[0] = org; o->nhist = std::min(o->nhist + 1, 4); o->histT = GetTickCount64();
                o->last = org; o->dirty = true; o->needBack = true;
                gLastMove = GetTickCount64();
                // Yangi o'rinning orqa fonini AVVAL chizamiz, keyin oynani ko'chiramiz: DWM ikkalasini bir kadrda ko'rsatadi (eski tasvir yangi joyda qolmaydi)
                backAndPresent(S, o);
                SetWindowPos(o->hwnd, nullptr, org.x, org.y, W, H, SWP_NOACTIVATE | SWP_NOZORDER | SWP_SHOWWINDOW);
            }
            if (o->under) {   // shisha target'ning ostida (ikki-uch oyna oralig'i bo'lishi mumkin); Z-tartibni kamdan-kam va kechikish bilan tuzatamiz
                bool below = false; HWND w = o->target;
                for (int k = 0; k < 4 && w; k++) { w = GetWindow(w, GW_HWNDNEXT); if (w == o->hwnd) { below = true; break; } }
                if (!below && GetTickCount64() - o->lastZFix > 150) {
                    SetWindowPos(o->hwnd, o->target, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                    o->lastZFix = GetTickCount64();
                }
            }
            if (o->nhist > 1 && GetTickCount64() - o->histT > 300) { o->nhist = 1; o->needBack = true; }   // oyna to'xtadi: eski o'rinlar maskasi endi kerak emas
            alive.push_back(o);
        }
        if (alive.empty()) { Sleep(25); continue; }

        // har bir monitor uchun bir marta kadr olamiz
        bool anyFresh = false;
        for (size_t i = 0; i < S.outs.size(); i++) {
            OutDup& od = S.outs[i]; od.fresh = false; od.frame.Reset();
            bool used = false; for (Ov* o : alive) if (o->inited && rectHit(od.rc, o->last.x - PAD, o->last.y - PAD, o->last.x + o->W + PAD, o->last.y + o->H + PAD)) used = true;
            if (used && !od.dupl && GetTickCount64() >= od.retryAt) {   // qulf/UAC/ekran rejimi o'zgargandan keyin duplication uziladi: har 400 ms qayta ulanishga urinamiz
                od.retryAt = GetTickCount64() + 400;
                if (od.out1) od.out1->DuplicateOutput(S.dev.Get(), &od.dupl);
            }
            if (!used || !od.dupl) continue;
            DXGI_OUTDUPL_FRAME_INFO fi{}; ComPtr<IDXGIResource> res;
            HRESULT hr = od.dupl->AcquireNextFrame(anyFresh ? 0 : (GetTickCount64() - gLastMove < 400 ? 1 : 8), &fi, &res);
            if (SUCCEEDED(hr)) {
                if (fi.LastPresentTime.QuadPart != 0) {
                    res.As(&od.frame);
                    // Aks-sado: kadrdagi BARCHA o'zgarishlar bizning shisha oynalarimiz ichida bo'lsa va biz yaqinda Present qilgan bo'lsak, bu kadr bizning
                    // o'zimizning chizganimiz: qayta chizmaymiz (aks holda cheksiz sikl, doim ~100 kadr/s)
                    od.echo = false;
                    if (gSelfPresents > 0 && fi.TotalMetadataBufferSize > 0 && fi.TotalMetadataBufferSize < (1u << 20)) {
                        std::vector<BYTE> meta(fi.TotalMetadataBufferSize); UINT need = 0;
                        UINT moved = 0;
                        if (SUCCEEDED(od.dupl->GetFrameMoveRects((UINT)meta.size(), (DXGI_OUTDUPL_MOVE_RECT*)meta.data(), &moved)) && moved == 0
                            && SUCCEEDED(od.dupl->GetFrameDirtyRects((UINT)meta.size(), (RECT*)meta.data(), &need)) && need > 0) {
                            bool all = true; int n = (int)(need / sizeof(RECT)); const RECT* rr = (const RECT*)meta.data();
                            for (int k = 0; k < n && all; k++) {
                                RECT r = { rr[k].left + od.rc.left, rr[k].top + od.rc.top, rr[k].right + od.rc.left, rr[k].bottom + od.rc.top };
                                bool inside = false;
                                for (Ov* q : alive) if (q->inited && r.left >= q->last.x - 4 && r.top >= q->last.y - 4 && r.right <= q->last.x + q->W + 4 && r.bottom <= q->last.y + q->H + 4) inside = true;
                                if (!inside) all = false;
                            }
                            if (all) { od.echo = true; gSelfPresents--; }
                        }
                    }
                    bool hasVisibleOv = false; for (Ov* q : alive) if (q->visible && q->inited && rectHit(od.rc, q->last.x - PAD, q->last.y - PAD, q->last.x + q->W + PAD, q->last.y + q->H + PAD)) hasVisibleOv = true;
                    if (!gAffVisible || hasVisibleOv) {   // skrinshot rejimida (yashiriladigan oynalar uchun) orqa fon muzlatiladi
                        S.ctx->CopyResource(od.deskB.Get(), od.frame.Get());
                        if (od.valid)   // birinchi kadrda maska yo'q: toza nusxa hali yo'q
                            for (Ov* q : alive) if (q->visible && q->inited && rectHit(od.rc, q->last.x - PAD, q->last.y - PAD, q->last.x + q->W + PAD, q->last.y + q->H + PAD)) maskPass(S, q, od);
                        std::swap(od.desk, od.deskB); std::swap(od.deskSrv, od.deskBSrv); std::swap(od.deskRtv, od.deskBRtv);
                        od.fresh = !od.echo; anyFresh = true;
                        if (!od.valid) { od.valid = true; for (Ov* q : alive) q->needBack = true; }   // yangi monitorning birinchi kadri: hamma qatlam orqa fonini to'ldiradi
                    }
                }
                else od.dupl->ReleaseFrame();
            } else if (hr == DXGI_ERROR_ACCESS_LOST) { od.dupl.Reset(); od.retryAt = 0; }   // keyingi aylanishda qayta ulanadi
        }
        for (Ov* o : alive) {
            if (!o->inited) continue;
            bool freshHere = false;
            for (auto& od : S.outs) if (od.fresh && rectHit(od.rc, o->last.x - PAD, o->last.y - PAD, o->last.x + o->W + PAD, o->last.y + o->H + PAD)) freshHere = true;
            if (freshHere || o->needBack) backAndPresent(S, o);
            else if (backReady(S, o) && o->dirty.exchange(false)) {
                LARGE_INTEGER t0, t1, fq; QueryPerformanceFrequency(&fq); QueryPerformanceCounter(&t0);
                render(S, o, false);
                o->sc->Present(0, 0); gSelfPresents = std::min(gSelfPresents + 1, 4);
                QueryPerformanceCounter(&t1);
                o->lastUs = (int)((t1.QuadPart - t0.QuadPart) * 1000000 / fq.QuadPart);
                o->frames++;
            }
            if (o->lumaReq.exchange(false)) probeLuma(S, o);
            if (o->dumpReq.load() && !o->dumpDone) {
                render(S, o, true); dumpBackbuffer(S, o); o->dumpDone = 1; o->dirty = true;
            }
        }
        for (size_t i = 0; i < S.outs.size(); i++) if (S.outs[i].dupl && S.outs[i].frame) { S.outs[i].frame.Reset(); S.outs[i].dupl->ReleaseFrame(); }
    }
    if (hook) UnhookWindowsHookEx(hook);
    {
        std::lock_guard<std::mutex> lk(gMu);
        for (Ov* o : gActive) teardown(o);
        gActive.clear();
    }
}

extern "C" {
__declspec(dllexport) void* lg_create3(HWND target, int under, int visible) {
    Ov* o = new Ov(); o->target = target; o->under = under != 0; o->visible = visible != 0;
    std::lock_guard<std::mutex> lk(gMu);
    gPending.push_back(o);
    if (!gRun.exchange(true)) gThread = std::thread(worker);
    return o;
}
__declspec(dllexport) void* lg_create2(HWND target, int under) { return lg_create3(target, under, 0); }
__declspec(dllexport) void* lg_create(HWND target) { return lg_create3(target, 0, 0); }
// Skrinshot/ekran ulashish uchun: ms davomida shisha oynalari suratga tushadi (orqa fon muzlaydi). 0 = darhol qaytarish.
__declspec(dllexport) void lg_capture_visible(int ms) { gCaptureUntil = ms > 0 ? GetTickCount64() + (ULONGLONG)ms : 0; }
__declspec(dllexport) void lg_destroy(void* h) {
    Ov* o = (Ov*)h; if (!o) return;
    o->stop = true;
    for (int i = 0; i < 400 && !o->done; i++) Sleep(5);
    { std::lock_guard<std::mutex> lk(gMu); gActive.erase(std::remove(gActive.begin(), gActive.end(), o), gActive.end()); gPending.erase(std::remove(gPending.begin(), gPending.end(), o), gPending.end()); }
    delete o;
}
// params: ior, thick, bevel, disp, blur, spec, absorb, merge, shadowK, shadowOff, extraLod, dpr (12 ta)
// shapes: har shakl 12 float: cx, cy, hw, hh | radius, bevelScale (<0 = tiniq ichki), thickScale (<0 = ramka), 0 | tint r,g,b,a
__declspec(dllexport) void lg_set(void* h, const float* params, int np, const float* shapes, int count) {
    Ov* o = (Ov*)h; if (!o) return;
    std::lock_guard<std::mutex> lk(o->mu);
    if (params) for (int i = 0; i < std::min(np, 16); i++) o->params[i] = params[i];
    count = std::min(std::max(count, 0), MAX_SHAPES);
    o->shapes.assign(shapes, shapes + (size_t)count * 12);
    o->count = count; o->dirty = true;
}
// Oyna kontenti: premultiplied BGRA, o'lchami oyna ichki maydoniga (haqiqiy piksel) teng. w=0 bo'lsa kontent o'chadi.
__declspec(dllexport) void lg_set_content(void* h, const uint8_t* bgra, int w, int hgt, int stride) {
    Ov* o = (Ov*)h; if (!o) return;
    std::lock_guard<std::mutex> lk(o->mu);
    if (!bgra || w <= 0) { o->hasContent = false; o->pendingContent.clear(); o->contentNew = false; o->dirty = true; return; }
    o->pendingContent.assign(bgra, bgra + (size_t)stride * hgt);
    o->pcW = w; o->pcH = hgt; o->pcStride = stride; o->contentNew = true; o->dirty = true;
}
// Popup ichki qismini Gauss bilan xiralashtirish (sigma: haqiqiy piksel; 0 = o'chiq)
__declspec(dllexport) void lg_set_frost(void* h, float sigma) { Ov* o = (Ov*)h; if (o) { o->frostSigma = sigma; o->needBack = true; } }
// Qirra refraksiyasining Gauss xiraligi (sigma: haqiqiy piksel; 0 = o'chiq)
__declspec(dllexport) void lg_set_edge(void* h, float sigma) { Ov* o = (Ov*)h; if (o) { o->edgeSigma = sigma; o->needBack = true; } }
__declspec(dllexport) void lg_set_hold(void* h, int on) { Ov* o = (Ov*)h; if (o) { o->hold = on != 0; o->needBack = true; } }
// Orqa fon yorqinligi: oxirgi o'lchangan qiymatni qaytaradi va yangisini so'raydi (render oqimi keyingi kadrda o'lchaydi)
__declspec(dllexport) float lg_luma(void* h) { Ov* o = (Ov*)h; if (!o) return 0.5f; o->lumaReq = true; return o->luma; }
__declspec(dllexport) void lg_light(void* h, float x, float y) {
    Ov* o = (Ov*)h; if (!o) return;
    { std::lock_guard<std::mutex> lk(o->mu); o->lightX = x; o->lightY = y; }
    o->dirty = true;
}
__declspec(dllexport) int lg_dump2(void* h, const wchar_t* path, int which) {
    Ov* o = (Ov*)h; if (!o) return 0;
    o->dumpWhich = which;
    o->dumpDone = 0; o->dumpPath = path; o->dumpReq = 1;
    for (int i = 0; i < 300 && o->dumpDone == 0; i++) Sleep(10);
    int ok = o->dumpDone; o->dumpReq = 0; o->dumpPath.clear(); o->dumpWhich = 0; return ok;
}
__declspec(dllexport) int lg_dump(void* h, const wchar_t* path) {
    Ov* o = (Ov*)h; if (!o) return 0;
    o->dumpDone = 0; o->dumpPath = path; o->dumpReq = 1;
    for (int i = 0; i < 300 && o->dumpDone == 0; i++) Sleep(10);
    int ok = o->dumpDone; o->dumpReq = 0; o->dumpPath.clear(); return ok;
}
__declspec(dllexport) void lg_error(void* h, int* stage, long* hr) { Ov* o = (Ov*)h; if (!o) return; *stage = o->errStage; *hr = o->errHr; }
__declspec(dllexport) void lg_info(void* h, long* frames, long* updates, int* lastUs) {
    Ov* o = (Ov*)h; if (!o) return;
    *frames = o->frames; *updates = o->updates; *lastUs = o->lastUs;
}
}
