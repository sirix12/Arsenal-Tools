/**
 * Pyodide WebAssembly Runtime for Matplotlib & MATLAB Execution
 * Loads CPython + NumPy + Matplotlib in-browser, captures figures as high-DPI PNG & SVG,
 * and renders both native Python Matplotlib scripts and evaluated MATLAB figure specs.
 */

let pyodideInstance = null;
let pyodideLoadingPromise = null;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js';

export function isPyodideReady() {
  return Boolean(pyodideInstance);
}

export async function getPyodide(onProgress) {
  if (pyodideInstance) return pyodideInstance;

  if (pyodideLoadingPromise) {
    return pyodideLoadingPromise;
  }

  pyodideLoadingPromise = (async () => {
    try {
      if (onProgress) onProgress('Loading Python WebAssembly runtime from CDN...');

      if (!window.loadPyodide) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = PYODIDE_CDN;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error('Failed to load Pyodide WebAssembly script from CDN.'));
          document.head.appendChild(script);
        });
      }

      if (onProgress) onProgress('Initializing CPython WebAssembly VM...');
      const pyodide = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/',
      });

      if (onProgress) onProgress('Loading NumPy & Matplotlib Wasm packages...');
      await pyodide.loadPackage(['numpy', 'matplotlib']);

      await pyodide.runPythonAsync(`
import io
import sys
import base64
import json
import warnings
warnings.filterwarnings("ignore")
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# Override plt.show to a no-op so scripts calling plt.show() don't clear figures before capture
plt.show = lambda *args, **kwargs: None
`);

      pyodideInstance = pyodide;
      return pyodide;
    } catch (err) {
      pyodideLoadingPromise = null;
      throw err;
    }
  })();

  return pyodideLoadingPromise;
}

export async function runPyodideMatplotlib(code, onProgress, optionsOrMatlabSpec = null) {
  const pyodide = await getPyodide(onProgress);

  if (onProgress) onProgress('Rendering diagram with Matplotlib Wasm...');

  let matlabFigureSpec = null;
  let plotTheme = 'light';
  let figureScale = 'auto';
  let subplotSpacing = 'normal';

  if (optionsOrMatlabSpec && typeof optionsOrMatlabSpec === 'object') {
    if ('subplots' in optionsOrMatlabSpec) {
      matlabFigureSpec = optionsOrMatlabSpec;
    } else {
      matlabFigureSpec = optionsOrMatlabSpec.matlabFigureSpec || null;
      plotTheme = optionsOrMatlabSpec.plotTheme || 'light';
      figureScale = optionsOrMatlabSpec.figureScale || 'auto';
      subplotSpacing = optionsOrMatlabSpec.subplotSpacing || 'normal';
    }
  }

  pyodide.globals.set('_plot_theme', plotTheme);
  pyodide.globals.set('_fig_scale', figureScale);
  pyodide.globals.set('_subplot_spacing', subplotSpacing);

  // Branch 1: Render evaluated MATLAB figure spec through real Matplotlib in Pyodide
  if (
    matlabFigureSpec &&
    Array.isArray(matlabFigureSpec.subplots) &&
    matlabFigureSpec.subplots.length > 0
  ) {
    pyodide.globals.set('_matlab_fig_json', JSON.stringify(matlabFigureSpec));
    const matlabToMplHarness = `
import io, base64, json, re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.close('all')

if _plot_theme == 'dark':
    plt.style.use('dark_background')
    fig_bg = '#0f172a'
    ax_bg = '#1e293b'
    text_col = '#f8fafc'
    grid_col = '#475569'
    spine_col = '#475569'
else:
    plt.style.use('default')
    fig_bg = '#ffffff'
    ax_bg = '#ffffff'
    text_col = '#0f172a'
    grid_col = '#cbd5e1'
    spine_col = '#94a3b8'

_spacing_map = {
    'compact':  {'pad': 1.1, 'h_pad': 1.4, 'w_pad': 1.2},
    'normal':   {'pad': 1.8, 'h_pad': 2.5, 'w_pad': 2.0},
    'spacious': {'pad': 2.5, 'h_pad': 3.5, 'w_pad': 2.8},
}
sp_cfg = _spacing_map.get(_subplot_spacing, _spacing_map['normal'])

_scale_dims = {
    'compact':  (7.5, 5.0),
    'standard': (9.5, 6.5),
    'wide':     (12.5, 7.5),
    'tall':     (9.5, 10.5),
    'large':    (14.0, 10.0),
}

def _fmt_matlab_tex(text):
    if not text or '$' in text:
        return text
    if re.search(r'\\^\\{[^}]+\\}|_\\{[^}]+\\}', text):
        text = re.sub(r'([a-zA-Z0-9]+(?:\\^\\{[^}]+\\}|_\\{[^}]+\\})+)', r'$\\1$', text)
    return text

spec = json.loads(_matlab_fig_json)
subplots = spec.get('subplots', [])
max_rows = max([sp.get('rows', 1) for sp in subplots] or [1])
max_cols = max([sp.get('cols', 1) for sp in subplots] or [1])

if _fig_scale in _scale_dims:
    fig_w, fig_h = _scale_dims[_fig_scale]
else:
    fig_w = 9.5 if max_cols == 1 else max(10.5, 5.0 * max_cols)
    fig_h = max(5.2, 3.15 * max_rows) if max_rows > 1 else 5.5

fig = plt.figure(figsize=(fig_w, fig_h), dpi=150, facecolor=fig_bg)
if spec.get('title'):
    fig.suptitle(_fmt_matlab_tex(spec['title']), fontsize=13, fontweight='bold', color=text_col)

ls_map = {'solid': '-', 'dashed': '--', 'dotted': ':', 'dashdot': '-.', 'none': 'None'}

for sp in subplots:
    r = sp.get('rows', 1)
    c = sp.get('cols', 1)
    idx = sp.get('index', 1)
    is_polar = sp.get('isPolar', False)
    is_3d = sp.get('is3D', False)
    if is_3d:
        ax = fig.add_subplot(r, c, idx, projection='3d')
        ax.set_facecolor(fig_bg)
    elif is_polar:
        ax = fig.add_subplot(r, c, idx, projection='polar', facecolor=ax_bg)
    else:
        ax = fig.add_subplot(r, c, idx, facecolor=ax_bg)
        for spine in ax.spines.values():
            spine.set_color(spine_col)

    if sp.get('xscale') == 'log':
        ax.set_xscale('log')
    if sp.get('yscale') == 'log':
        ax.set_yscale('log')

    has_labeled_series = False
    series_list = sp.get('series', [])

    for s in series_list:
        stype = s.get('type', 'line')
        color = s.get('color', '#2563eb')
        lw = s.get('lineWidth', 2)
        ls = ls_map.get(s.get('lineStyle', 'solid'), '-')
        label = s.get('label', '')
        if s.get('hasExplicitLabel'):
            has_labeled_series = True
        x = s.get('x', [])
        y = s.get('y', [])

        if stype == 'yline':
            ax.axhline(s.get('val', 0), color=color, linestyle=ls, linewidth=lw, label=label)
        elif stype == 'xline':
            ax.axvline(s.get('val', 0), color=color, linestyle=ls, linewidth=lw, label=label)
        elif stype in ('surf', 'mesh') and is_3d:
            X = np.array(x, dtype=float)
            Y = np.array(y, dtype=float)
            Z = np.array(s.get('z', []), dtype=float)
            if stype == 'surf':
                ax.plot_surface(X, Y, Z, cmap='viridis', edgecolor='none', alpha=0.92)
            else:
                ax.plot_wireframe(X, Y, Z, color=color, linewidth=0.85)
        elif stype == 'plot3' and is_3d:
            Z = np.array(s.get('z', []), dtype=float)
            ax.plot(np.array(x, dtype=float), np.array(y, dtype=float), Z, color=color, linestyle=ls, linewidth=lw, label=label)
        elif stype in ('contour', 'contourf', 'heatmap'):
            Z = np.array(s.get('z', []), dtype=float)
            if stype == 'heatmap':
                im = ax.imshow(Z, cmap='viridis', aspect='auto', origin='lower')
                fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
            else:
                X = np.array(x, dtype=float)
                Y = np.array(y, dtype=float)
                if stype == 'contourf':
                    cf = ax.contourf(X, Y, Z, levels=18, cmap='viridis')
                    fig.colorbar(cf, ax=ax, fraction=0.046, pad=0.04)
                else:
                    ax.contour(X, Y, Z, levels=14, cmap='viridis')
        elif stype == 'stem':
            markerline, stemlines, baseline = ax.stem(x, y, label=label)
            plt.setp(stemlines, 'color', color, 'linewidth', lw)
            plt.setp(markerline, 'color', color, 'markersize', s.get('markerSize', 5))
        elif stype == 'stairs':
            ax.step(x, y, where='post', color=color, linewidth=lw, label=label)
        elif stype == 'scatter':
            ax.scatter(x, y, color=color, label=label, s=30, alpha=0.85)
        elif stype == 'bar':
            width = (x[1] - x[0]) * s.get('barWidthRatio', 0.85) if len(x) > 1 else 0.8
            ax.bar(x, y, width=width, color=color, alpha=0.85, edgecolor=fig_bg, label=label)
        elif stype == 'barh':
            height = (x[1] - x[0]) * 0.85 if len(x) > 1 else 0.8
            ax.barh(x, y, height=height, color=color, alpha=0.85, label=label)
        elif stype == 'area':
            ax.fill_between(x, y, 0, color=color, alpha=0.35, label=label)
            ax.plot(x, y, color=color, linewidth=lw)
        else:
            mk = s.get('marker', 'none')
            mk_arg = None if mk == 'none' else mk
            ax.plot(
                x, y,
                color=color,
                linestyle=ls,
                linewidth=lw,
                marker=mk_arg,
                markersize=s.get('markerSize', 4.5),
                label=label
            )

    if sp.get('title'):
        ax.set_title(_fmt_matlab_tex(sp['title']), fontsize=11, fontweight='bold', color=text_col, pad=8)
    if sp.get('xlabel'):
        ax.set_xlabel(_fmt_matlab_tex(sp['xlabel']), fontsize=9.5, color=text_col)
    if sp.get('ylabel'):
        ax.set_ylabel(_fmt_matlab_tex(sp['ylabel']), fontsize=9.5, color=text_col)
    if is_3d and sp.get('zlabel'):
        ax.set_zlabel(_fmt_matlab_tex(sp['zlabel']), fontsize=9.5, color=text_col)
    if sp.get('xlim') and not is_polar and not is_3d:
        ax.set_xlim(sp['xlim'][0], sp['xlim'][1])
    if sp.get('ylim') and not is_polar and not is_3d:
        ax.set_ylim(sp['ylim'][0], sp['ylim'][1])
    if sp.get('grid', True) and not is_3d:
        ax.grid(True, linestyle='--', alpha=0.45, color=grid_col)
    if (sp.get('showLegend') or has_labeled_series or len(series_list) > 1) and not is_3d:
        handles, labels_found = ax.get_legend_handles_labels()
        if handles:
            ax.legend(loc='best', fontsize=8.5, framealpha=0.88)

try:
    if spec.get('title'):
        fig.tight_layout(pad=sp_cfg['pad'], h_pad=sp_cfg['h_pad'], w_pad=sp_cfg['w_pad'], rect=[0, 0, 1, 0.95])
    else:
        fig.tight_layout(pad=sp_cfg['pad'], h_pad=sp_cfg['h_pad'], w_pad=sp_cfg['w_pad'])
except Exception:
    pass

png_buf = io.BytesIO()
fig.savefig(png_buf, format='png', dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
png_buf.seek(0)
png_b64 = "data:image/png;base64," + base64.b64encode(png_buf.read()).decode('utf-8')

svg_buf = io.StringIO()
fig.savefig(svg_buf, format='svg', bbox_inches='tight', facecolor=fig.get_facecolor())
svg_str = svg_buf.getvalue()

json.dumps({
    "figures": [{"id": 1, "png": png_b64, "svg": svg_str}],
    "stdout": "",
    "stderr": "",
    "error": None
})
`;
    const rawJson = await pyodide.runPythonAsync(matlabToMplHarness);
    const parsed = JSON.parse(rawJson);
    return {
      success: true,
      figures: parsed.figures || [],
      stdout: parsed.stdout || '',
      stderr: '',
      error: null,
      variables: [],
    };
  }

  // Branch 2: Native Python Matplotlib execution
  pyodide.globals.set('_user_python_code', code);

  const pythonHarness = `
import io
import sys
import base64
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

plt.close('all')
if _plot_theme == 'dark':
    plt.style.use('dark_background')
else:
    plt.style.use('default')

plt.show = lambda *args, **kwargs: None

def _ensure_3d_ax():
    fig = plt.gcf()
    ax = plt.gca()
    if getattr(ax, 'name', '') != '3d':
        try:
            spec = ax.get_subplotspec()
            fig.delaxes(ax)
            ax = fig.add_subplot(spec, projection='3d')
        except Exception:
            fig.delaxes(ax)
            ax = fig.add_subplot(111, projection='3d')
    return ax

def _plt_plot_surface(X, Y, Z, *args, **kwargs):
    ax = _ensure_3d_ax()
    if 'cmap' not in kwargs and 'color' not in kwargs:
        kwargs['cmap'] = 'viridis'
    return ax.plot_surface(X, Y, Z, *args, **kwargs)

def _plt_plot_wireframe(X, Y, Z, *args, **kwargs):
    ax = _ensure_3d_ax()
    return ax.plot_wireframe(X, Y, Z, *args, **kwargs)

def _plt_plot3D(x, y, z, *args, **kwargs):
    ax = _ensure_3d_ax()
    return ax.plot(x, y, z, *args, **kwargs)

plt.plot_surface = _plt_plot_surface
plt.plot_wireframe = _plt_plot_wireframe
plt.plot3D = _plt_plot3D

_spacing_map = {
    'compact':  {'pad': 1.1, 'h_pad': 1.4, 'w_pad': 1.2},
    'normal':   {'pad': 1.8, 'h_pad': 2.5, 'w_pad': 2.0},
    'spacious': {'pad': 2.5, 'h_pad': 3.5, 'w_pad': 2.8},
}
sp_cfg = _spacing_map.get(_subplot_spacing, _spacing_map['normal'])

_scale_dims = {
    'compact':  (7.5, 5.0),
    'standard': (9.5, 6.5),
    'wide':     (12.5, 7.5),
    'tall':     (9.5, 10.5),
    'large':    (14.0, 10.0),
}

_stdout_stream = io.StringIO()
_stderr_stream = io.StringIO()
_orig_stdout = sys.stdout
_orig_stderr = sys.stderr
sys.stdout = _stdout_stream
sys.stderr = _stderr_stream

_exec_error = None
_user_ns = {"__name__": "__main__", "plt": plt, "np": np, "matplotlib": matplotlib}

try:
    exec(_user_python_code, _user_ns)
except Exception as e:
    import traceback
    _exec_error = traceback.format_exc()
finally:
    sys.stdout = _orig_stdout
    sys.stderr = _orig_stderr

_captured_stdout = _stdout_stream.getvalue()
_captured_stderr = _stderr_stream.getvalue()

# Extract workspace variables from _user_ns
_vars_info = []
_skip_keys = {"__name__", "__builtins__", "plt", "np", "matplotlib", "fig", "ax", "axes"}
for k, v in _user_ns.items():
    if k.startswith("_") or k in _skip_keys:
        continue
    if isinstance(v, (int, float, np.number)) and not isinstance(v, bool):
        val_f = float(v)
        _vars_info.append({
            "name": k,
            "type": "scalar",
            "size": "1×1",
            "min": round(val_f, 4),
            "max": round(val_f, 4)
        })
    elif isinstance(v, (list, tuple, np.ndarray)):
        try:
            arr = np.asarray(v, dtype=float)
            if arr.size > 0:
                shape_str = "×".join(str(d) for d in arr.shape) if arr.ndim > 1 else f"1×{arr.size}"
                _vars_info.append({
                    "name": k,
                    "type": "matrix" if arr.ndim > 1 else "vector",
                    "size": shape_str,
                    "min": round(float(np.nanmin(arr)), 4),
                    "max": round(float(np.nanmax(arr)), 4)
                })
        except Exception:
            pass

_figures_output = []
try:
    fig_nums = plt.get_fignums()
    for num in fig_nums:
        fig = plt.figure(num)
        if _plot_theme == 'dark' and fig.get_facecolor() == (1.0, 1.0, 1.0, 1.0):
            fig.patch.set_facecolor('#0f172a')

        # Detect subplot grid layout to prevent overlaps when figsize wasn't explicitly scaled
        axes = fig.get_axes()
        max_r, max_c = 1, 1
        has_3d = False
        for ax in axes:
            if getattr(ax, 'name', '') == '3d':
                has_3d = True
            try:
                gs = ax.get_subplotspec().get_gridspec()
                max_r = max(max_r, gs.nrows)
                max_c = max(max_c, gs.ncols)
            except Exception:
                pass

        if _fig_scale in _scale_dims:
            fig.set_size_inches(_scale_dims[_fig_scale][0], _scale_dims[_fig_scale][1], forward=True)
        else:
            cur_w, cur_h = fig.get_size_inches()
            # If figure is still at Matplotlib's small 6.4x4.8 default, scale it proportionally to subplot grid
            if cur_w <= 6.6 and cur_h <= 5.0:
                target_w = max(8.8, 4.8 * max_c)
                target_h = max(5.2, 3.4 * max_r) if max_r > 1 else 5.2
                fig.set_size_inches(target_w, target_h, forward=True)

        # Apply tight_layout with user's spacing configuration so titles and xlabels never overlap
        try:
            if not has_3d:
                if getattr(fig, '_suptitle', None) is not None:
                    fig.tight_layout(pad=sp_cfg['pad'], h_pad=sp_cfg['h_pad'], w_pad=sp_cfg['w_pad'], rect=[0, 0, 1, 0.94])
                else:
                    fig.tight_layout(pad=sp_cfg['pad'], h_pad=sp_cfg['h_pad'], w_pad=sp_cfg['w_pad'])
            else:
                fig.subplots_adjust(hspace=0.35, wspace=0.3)
        except Exception:
            pass
        
        png_buf = io.BytesIO()
        fig.savefig(png_buf, format='png', dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
        png_buf.seek(0)
        png_base64 = "data:image/png;base64," + base64.b64encode(png_buf.read()).decode('utf-8')
        
        svg_buf = io.StringIO()
        fig.savefig(svg_buf, format='svg', bbox_inches='tight', facecolor=fig.get_facecolor())
        svg_str = svg_buf.getvalue()
        
        _figures_output.append({
            "id": int(num),
            "png": png_base64,
            "svg": svg_str
        })
except Exception as e:
    if not _exec_error:
        _exec_error = str(e)

json.dumps({
    "figures": _figures_output,
    "stdout": _captured_stdout,
    "stderr": _captured_stderr,
    "error": _exec_error,
    "variables": _vars_info
})
`;

  try {
    const rawResultJson = await pyodide.runPythonAsync(pythonHarness);
    const parsed = JSON.parse(rawResultJson);
    return {
      success: !parsed.error,
      figures: parsed.figures || [],
      stdout: parsed.stdout || '',
      stderr: parsed.stderr || '',
      error: parsed.error || null,
      variables: parsed.variables || [],
    };
  } catch (err) {
    return {
      success: false,
      figures: [],
      stdout: '',
      stderr: '',
      error: err.message,
      variables: [],
    };
  }
}
