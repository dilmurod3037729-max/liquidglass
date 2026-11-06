// Eng kichik C++ namuna: oddiy Win32 oyna, ustiga shisha karta va ikkita tugma.
#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include "lgwin.h"

static void* g_glass = nullptr;
static float g_dpr = 1.f;

static LRESULT CALLBACK proc(HWND h, UINT m, WPARAM w, LPARAM l) {
    switch (m) {
    case WM_PAINT: {   // rangli fon: shisha shuni sindiradi
        PAINTSTRUCT ps; HDC dc = BeginPaint(h, &ps); RECT rc; GetClientRect(h, &rc);
        for (int y = 0; y < rc.bottom; y += 4) {
            HBRUSH b = CreateSolidBrush(RGB(30 + y * 140 / rc.bottom, 80 + y * 60 / rc.bottom, 200 - y * 120 / rc.bottom));
            RECT r{ 0, y, rc.right, y + 4 }; FillRect(dc, &r, b); DeleteObject(b);
        }
        SetBkMode(dc, TRANSPARENT); SetTextColor(dc, RGB(255, 255, 255));
        TextOutW(dc, 60, 70, L"Karta sarlavhasi", 16);
        EndPaint(h, &ps); return 0; }
    case WM_MOUSEMOVE:   // yorug'lik kursorga ergashadi
        if (g_glass) { RECT rc; GetClientRect(h, &rc); lg_light(g_glass, (GET_X_LPARAM(l) / float(rc.right) - .5f) * 2, (GET_Y_LPARAM(l) / float(rc.bottom) - .5f) * 2); }
        return 0;
    case WM_DESTROY: if (g_glass) lg_destroy(g_glass); PostQuitMessage(0); return 0;
    }
    return DefWindowProcW(h, m, w, l);
}

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE, PWSTR, int) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    WNDCLASSW wc{}; wc.lpfnWndProc = proc; wc.hInstance = hi; wc.lpszClassName = L"LGSample"; wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    RegisterClassW(&wc);
    HWND hwnd = CreateWindowW(L"LGSample", L"lgwin namunasi", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 200, 150, 800, 520, nullptr, nullptr, hi, nullptr);
    g_dpr = GetDpiForWindow(hwnd) / 96.f;

    g_glass = lg_create2(hwnd, 0);                       // shisha oyna ustida
    LGShape shapes[] = {
        lgRect(40, 40, 360, 220, 16, g_dpr),             // karta
        lgRect(60, 300, 130, 44, 14, g_dpr),             // tugma
        lgRect(210, 300, 130, 44, 14, g_dpr),            // tugma
    };
    shapes[0].bevel = -0.45f; shapes[0].thick = 0.3f;    // karta: qirrasi shisha, markazi tiniq
    lgSet(g_glass, lgDefaultParams(g_dpr), shapes, 3);

    MSG msg; while (GetMessageW(&msg, nullptr, 0, 0)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    return 0;
}
