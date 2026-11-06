// LiquidGlass.cs: lgwin.dll uchun .NET (WinForms, WPF, WinUI) wrapper. Faylni loyihangizga qo'shing, lgwin.dll ni chiqish papkasiga ko'chiring.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace LiquidGlass
{
    /// <summary>Shisha shakli. Koordinatalar oyna ichki maydoni boshidan, HAQIQIY piksellarda.</summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct Shape
    {
        public float Cx, Cy, Hw, Hh, Radius;
        public float Bevel, Thick;      // 1 = standart; Bevel &lt; 0 = tiniq ichki, Thick &lt; 0 = ramka
        public float Reserved;
        public float R, G, B, A;        // A = 0 tiniq shisha, A &gt; 0 rangli

        /// <summary>Mantiqiy piksel to'rtburchagidan (WinForms Control.Bounds kabi) shakl yasaydi.</summary>
        public static Shape FromRect(float x, float y, float w, float h, float radius, float dpr = 1f,
                                     float bevel = 1f, float thick = 1f)
            => new Shape { Cx = (x + w / 2) * dpr, Cy = (y + h / 2) * dpr, Hw = w / 2 * dpr, Hh = h / 2 * dpr,
                           Radius = radius * dpr, Bevel = bevel, Thick = thick };
    }

    /// <summary>Umumiy sozlamalar (mantiqiy piksellarda; Merge haqiqiy piksel).</summary>
    public sealed class Params
    {
        public float Ior = 1.55f, Thick = 40f, Bevel = 26f, Dispersion = 0.04f, Blur = 0.35f, Specular = 1.1f,
                     Absorb = 0.2f, Shadow = 0.45f, ShadowOffset = 26f, ExtraLod = 0.7f;
        internal float[] ToArray(float dpr) => new[] { Ior, Thick, Bevel, Dispersion, Blur, Specular, Absorb, 1f * dpr,
                                                       Shadow, ShadowOffset, ExtraLod, dpr };
    }

    /// <summary>Oynaga bog'langan shisha qatlami.</summary>
    public sealed class GlassLayer : IDisposable
    {
        const string Dll = "lgwin.dll";
        [DllImport(Dll)] static extern IntPtr lg_create2(IntPtr hwnd, int under);
        [DllImport(Dll)] static extern void lg_destroy(IntPtr h);
        [DllImport(Dll)] static extern void lg_set(IntPtr h, float[] p, int np, Shape[] shapes, int count);
        [DllImport(Dll)] static extern void lg_light(IntPtr h, float x, float y);
        [DllImport(Dll)] static extern void lg_info(IntPtr h, out int frames, out int updates, out int us);

        IntPtr _h;
        public Params Settings { get; } = new Params();
        public float Dpr { get; set; } = 1f;

        /// <param name="hwnd">oyna dastagi (Form.Handle yoki WindowInteropHelper.Handle)</param>
        /// <param name="under">true: shisha oyna OSTIDA (oyna shaffof bo'lsin); false: ustida</param>
        public GlassLayer(IntPtr hwnd, bool under = false) { _h = lg_create2(hwnd, under ? 1 : 0); }

        /// <summary>Barcha shakllarni almashtiradi.</summary>
        public void SetShapes(IReadOnlyList<Shape> shapes)
        {
            var arr = new Shape[shapes.Count];
            for (int i = 0; i < arr.Length; i++) arr[i] = shapes[i];
            lg_set(_h, Settings.ToArray(Dpr), 12, arr, arr.Length);
        }

        /// <summary>Yorug'lik yo'nalishi, -1..1.</summary>
        public void SetLight(float x, float y) => lg_light(_h, x, y);

        public void Dispose() { if (_h != IntPtr.Zero) { lg_destroy(_h); _h = IntPtr.Zero; } }
    }
}
