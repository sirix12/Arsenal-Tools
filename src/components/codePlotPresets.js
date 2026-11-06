/**
 * Curated MATLAB & Matplotlib Presets
 * Showcases 2D multi-curves, subplots + FFT, Bode plots, polar plots,
 * discrete stem/stairs, 2D contours, and 3D surface visualizations.
 */

export const CODE_PLOT_PRESETS = [
  {
    id: 'matlab-convolution',
    name: 'MATLAB: Continuous-Time Convolution y(t) = x(t)*h(t)',
    category: 'Signals & Systems',
    language: 'matlab',
    description: 'Numerical vs analytical convolution of x(t) = e^{-t}u(t) and h(t) = u(t)-u(t-2) across 3 subplots',
    code: `% Clear workspace and figures
clear; clc; close all;

% 1. Define time vector and step size
dt = 0.002;             % Small step size to approximate continuous time
t = -1 : dt : 6;        % Time vector for x(t) and h(t)

% 2. Define unit step function u(t)
u = @(t) double(t >= 0);

% 3. Define signals x(t) and h(t)
x = exp(-t) .* u(t);
h = u(t) - u(t - 2);

% 4. Compute Convolution Numerically
y_num = conv(x, h) * dt;
t_y = (2*t(1)) : dt : (2*t(end));

% 5. Compute Analytical Result for Comparison
y_analytical = (1 - exp(-t)) .* u(t) - (1 - exp(-(t - 2))) .* u(t - 2);

% Plot 1: Input Signal x(t)
subplot(3, 1, 1);
plot(t, x, 'b-', 'LineWidth', 2, 'DisplayName', 'x(t) = e^{-t}u(t)');
grid on;
title('Input Signal: x(t) = e^{-t} u(t)');
ylabel('x(t)');
ylim([-0.2, 1.2]);

% Plot 2: Impulse Response h(t)
subplot(3, 1, 2);
plot(t, h, 'r-', 'LineWidth', 2, 'DisplayName', 'h(t) = u(t) - u(t-2)');
grid on;
title('Impulse Response: h(t) = u(t) - u(t-2)');
ylabel('h(t)');
ylim([-0.2, 1.2]);

% Plot 3: Convolution Output y(t)
subplot(3, 1, 3);
plot(t_y, y_num, 'b-', 'LineWidth', 2.2, 'DisplayName', 'Numerical conv(x,h)*dt');
hold on;
plot(t, y_analytical, 'r--', 'LineWidth', 2, 'DisplayName', 'Analytical Solution');
grid on;
xlim([-1, 6]);
ylim([-0.1, 1.0]);
title('Convolution Output: y(t) = x(t) * h(t)');
xlabel('Time t (s)');
ylabel('y(t)');
`,
  },
  {
    id: 'matlab-multi-wave',
    name: 'MATLAB: Modulated Wave & Envelopes',
    category: '2D Continuous',
    language: 'matlab',
    description: 'Carrier wave modulated by a slow envelope with dashed boundaries and formatted legend',
    code: `% Modulated Carrier Wave with Envelopes
t = 0:0.02:10;
carrier = sin(2*pi*1.2*t);
envelope = exp(-0.25*t) .* cos(2*pi*0.1*t);
signal = envelope .* carrier;

figure;
plot(t, signal, 'b-', 'LineWidth', 2.5, 'DisplayName', 'Modulated Wave');
hold on;
plot(t, envelope, 'r--', 'LineWidth', 1.8, 'DisplayName', '+Envelope');
plot(t, -envelope, 'r--', 'LineWidth', 1.8, 'DisplayName', '-Envelope');
grid on;

title('Amplitude Modulated Signal with Exponential Decay');
xlabel('Time (seconds)');
ylabel('Amplitude (V)');
disp('Plot generated: 501 data points computed.');
`,
  },
  {
    id: 'matlab-fft-subplots',
    name: 'MATLAB: Subplots & FFT Frequency Spectrum',
    category: 'Subplots & Signal',
    language: 'matlab',
    description: 'Dual subplot: Time-domain composite waveform and its Fast Fourier Transform magnitude',
    code: `% Time Domain Signal and FFT Spectrum
Fs = 100;                    % Sampling frequency (Hz)
t = 0:1/Fs:4;                % 4-second time vector
f1 = 5; f2 = 18;             % Frequency components
signal = 1.2*sin(2*pi*f1*t) + 0.8*cos(2*pi*f2*t);

% Subplot 1: Time Domain
subplot(2, 1, 1);
plot(t, signal, 'Color', '#3b82f6', 'LineWidth', 2, 'DisplayName', 'Composite Wave');
grid on;
title('Time Domain: f1 = 5 Hz, f2 = 18 Hz');
xlabel('Time (s)');
ylabel('Amplitude');

% Subplot 2: FFT Magnitude Spectrum
subplot(2, 1, 2);
L = length(signal);
Y = fft(signal);
P2 = abs(Y / L);
f = Fs * (0:(L/2)) / L;
stem(f, P2(1:length(f)), 'Color', '#ef4444', 'LineWidth', 2, 'DisplayName', 'Harmonics');
grid on;
title('Single-Sided Amplitude Spectrum |FFT|');
xlabel('Frequency (Hz)');
ylabel('|P1(f)|');
xlim([0, 30]);
`,
  },
  {
    id: 'matlab-bode-log',
    name: 'MATLAB: Bode Frequency Response (Log Scale)',
    category: 'Logarithmic',
    language: 'matlab',
    description: '2nd-order low-pass filter magnitude and phase on logarithmic frequency axes',
    code: `% 2nd-Order Low-Pass Filter Frequency Response
w = logspace(-1, 3, 200);   % Frequencies from 0.1 to 1000 rad/s
wn = 10;                     % Natural frequency = 10 rad/s
zeta = 0.35;                 % Damping ratio

% Magnitude in decibels (dB)
s = w ./ wn;
mag_dB = -20 * log10(sqrt((1 - s.^2).^2 + (2*zeta*s).^2));

subplot(2, 1, 1);
semilogx(w, mag_dB, 'Color', '#8b5cf6', 'LineWidth', 2.5, 'DisplayName', 'zeta = 0.35');
hold on;
yline(-3, 'DisplayName', '-3dB Cutoff');
grid on;
title('Bode Magnitude Response');
ylabel('Magnitude (dB)');

% Phase Response in degrees
subplot(2, 1, 2);
phase_deg = -rad2deg(atan2(2*zeta*s, 1 - s.^2));
semilogx(w, phase_deg, 'Color', '#06b6d4', 'LineWidth', 2.5, 'DisplayName', 'Phase');
grid on;
title('Bode Phase Response');
xlabel('Frequency \\omega (rad/s)');
ylabel('Phase (deg)');
`,
  },
  {
    id: 'matlab-polar-radiation',
    name: 'MATLAB: Polar Antenna Radiation Pattern',
    category: 'Polar',
    language: 'matlab',
    description: 'Multi-lobe antenna radiation pattern and cardioid in polar coordinates',
    code: `% Antenna Radiation Pattern & Cardioid
theta = 0:0.02:2*pi;
rho1 = abs(cos(3*theta) .* sin(2*theta)) + 0.2;
rho2 = 0.8 + 0.8*cos(theta);

polarplot(theta, rho1, 'b-', 'LineWidth', 2.5, 'DisplayName', 'Antenna Lobes');
hold on;
polarplot(theta, rho2, 'r--', 'LineWidth', 2, 'DisplayName', 'Cardioid Baseline');
title('Radiation Pattern (Polar Coordinates)');
`,
  },
  {
    id: 'matlab-discrete-stem',
    name: 'MATLAB: Discrete Pulses & Step Responses',
    category: 'Discrete',
    language: 'matlab',
    description: 'Digital signal discrete stem plot alongside stairs step-interpolated response',
    code: `% Discrete Pulse Sequence & Step Function
n = 0:25;
x = exp(-0.15*n) .* cos(0.4*pi*n);

subplot(2, 1, 1);
stem(n, x, 'Color', '#10b981', 'LineWidth', 2, 'DisplayName', 'Samples x[n]');
grid on;
title('Discrete Impulse Response x[n]');
xlabel('Sample Index (n)');
ylabel('x[n]');

subplot(2, 1, 2);
stairs(n, x, 'Color', '#f59e0b', 'LineWidth', 2.2, 'DisplayName', 'Zero-Order Hold');
grid on;
title('Reconstructed Zero-Order Hold (ZOH)');
xlabel('Sample Index (n)');
ylabel('Analog ZOH Output');
`,
  },
  {
    id: 'matlab-3d-surface',
    name: 'MATLAB: 3D Surface & Contour Elevation',
    category: '3D & Surface',
    language: 'matlab',
    description: '3D Mexican hat / sinc surface with dynamic azimuth orbit and 2D contour projection',
    code: `% 3D Sinc Ripple Surface
x = -8:0.5:8;
y = -8:0.5:8;
[X, Y] = meshgrid(x, y);
R = sqrt(X.^2 + Y.^2) + 1e-6;
Z = sin(R) ./ R;

subplot(1, 2, 1);
surf(X, Y, Z);
title('3D Sinc Ripple Surface (Drag to Rotate)');
xlabel('X');
ylabel('Y');
zlabel('Z = sin(r)/r');

subplot(1, 2, 2);
contourf(X, Y, Z);
title('2D Contour Heatmap Projection');
xlabel('X');
ylabel('Y');
`,
  },
  {
    id: 'python-matplotlib-dashboard',
    name: 'Python: Matplotlib Multi-Panel Dashboard',
    category: 'Matplotlib',
    language: 'python',
    description: 'Matplotlib 4-panel dashboard with line plot, scatter, bar chart, and histogram',
    code: `import matplotlib.pyplot as plt
import numpy as np

# Create grid of 2x2 subplots
fig, axes = plt.subplots(2, 2)

# Panel 1: Damped Sine Wave
t = np.linspace(0, 10, 200)
y1 = np.exp(-0.3 * t) * np.cos(2 * np.pi * 0.8 * t)
plt.subplot(2, 2, 1)
plt.plot(t, y1, 'b-', label='Damped Wave')
plt.title('Damped Oscillations')
plt.xlabel('Time (s)')
plt.grid(True)

# Panel 2: Scatter Distribution
x2 = np.linspace(-3, 3, 40)
y2 = x2**2 + np.random.randn(40) * 1.5
plt.subplot(2, 2, 2)
plt.scatter(x2, y2, color='#ef4444', label='Observations')
plt.plot(x2, x2**2, 'k--', label='Quadratic Trend')
plt.title('Nonlinear Scatter with Trend')
plt.grid(True)

# Panel 3: Categorical Bar Chart
categories = [1, 2, 3, 4, 5]
performance = [35, 68, 85, 42, 91]
plt.subplot(2, 2, 3)
plt.bar(categories, performance, color='#10b981')
plt.title('Component Efficiency Score')
plt.xlabel('Test Channel')

# Panel 4: Normal Distribution Histogram
samples = np.random.randn(250)
plt.subplot(2, 2, 4)
plt.hist(samples, color='#8b5cf6')
plt.title('Gaussian Error Distribution')
plt.grid(True)

print("Dashboard executed successfully with 4 panels.")
`,
  },
  {
    id: 'python-3d-wireframe',
    name: 'Python: 3D Saddle & Wireframe Mesh',
    category: '3D & Surface',
    language: 'python',
    description: 'Hyperbolic paraboloid saddle surface rendered with 3D surface and wireframe mesh lines',
    code: `import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(-3, 3, 35)
y = np.linspace(-3, 3, 35)
X, Y = np.meshgrid(x, y)
Z = (X**2) / 4 - (Y**2) / 4

fig = plt.figure(figsize=(11, 5))

# Subplot 1: 3D Surface with Colormap
ax1 = fig.add_subplot(1, 2, 1, projection='3d')
surf = ax1.plot_surface(X, Y, Z, cmap='viridis', edgecolor='none', alpha=0.92)
ax1.set_title('Hyperbolic Paraboloid Surface')
ax1.set_xlabel('X')
ax1.set_ylabel('Y')
ax1.set_zlabel('Z')
fig.colorbar(surf, ax=ax1, shrink=0.65, pad=0.08)

# Subplot 2: 3D Wireframe Mesh
ax2 = fig.add_subplot(1, 2, 2, projection='3d')
ax2.plot_wireframe(X, Y, Z, color='#3b82f6', linewidth=0.85)
ax2.set_title('3D Wireframe Mesh')
ax2.set_xlabel('X')
ax2.set_ylabel('Y')
ax2.set_zlabel('Z')
`,
  },
];

