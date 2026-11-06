// C# (WinForms) namunasi: oddiy forma, ustiga shisha karta va tugmalar. Tugma/karta joylashuvi Control.Bounds'dan olinadi.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using LiquidGlass;

static class Program
{
    [STAThread]
    static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        var form = new Form { Text = "LiquidGlass C# namunasi", ClientSize = new Size(800, 520), StartPosition = FormStartPosition.CenterScreen };
        form.Paint += (s, e) =>
        {
            using var br = new LinearGradientBrush(form.ClientRectangle, Color.FromArgb(30, 80, 200), Color.FromArgb(170, 140, 80), 90f);
            e.Graphics.FillRectangle(br, form.ClientRectangle);
            e.Graphics.DrawString("Karta sarlavhasi", form.Font, Brushes.White, 60, 70);
        };
        var buttons = new[] { new Button { Text = "Hisoblash", Bounds = new Rectangle(60, 300, 130, 44), FlatStyle = FlatStyle.Flat },
                              new Button { Text = "Bekor", Bounds = new Rectangle(210, 300, 130, 44), FlatStyle = FlatStyle.Flat } };
        foreach (var b in buttons) { b.FlatAppearance.BorderSize = 0; b.BackColor = Color.Transparent; b.ForeColor = Color.White; form.Controls.Add(b); }

        GlassLayer glass = null;
        form.Shown += (s, e) =>
        {
            float dpr = form.DeviceDpi / 96f;
            glass = new GlassLayer(form.Handle) { Dpr = dpr };
            var shapes = new List<Shape> { Shape.FromRect(40, 40, 360, 220, 16, dpr, bevel: -0.45f, thick: 0.3f) };   // karta: markazi tiniq
            foreach (var b in buttons) shapes.Add(Shape.FromRect(b.Left, b.Top, b.Width, b.Height, 14, dpr));
            glass.SetShapes(shapes);
        };
        form.MouseMove += (s, e) => glass?.SetLight((e.X / (float)form.ClientSize.Width - .5f) * 2, (e.Y / (float)form.ClientSize.Height - .5f) * 2);
        form.FormClosed += (s, e) => glass?.Dispose();
        Application.Run(form);
    }
}
