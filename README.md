# Laboratorio de Vaciado de Tanques

Aplicación web que modela el vaciado de un tanque siguiendo paso a paso la metodología de
**L. F. Plaza Gálvez, “Modelo matemático para vaciado de tanques”, _Scientia et Technica_ 22(1), 2017**,
la extiende a cualquier geometría y genera automáticamente el **artículo científico exportable a PDF**.

## Qué hace

**Laboratorio (modelo teórico de tu tanque)**
- Tanque **3D interactivo** (Three.js): girar, zoom, desplazar, paredes de vidrio, agua al nivel exacto
  h(t), salida a escala y chorro con la trayectoria parabólica real (v = √(2g(h − z₀))).
- Geometrías: cilindro vertical, prisma rectangular, tronco de cono (balde), cono, esfera, cilindro horizontal.
- Unidades mm / cm / m; diámetro de salida desde una lista de pulgadas fraccionadas (1/8" a 4") o
  escrito en mm, cm o m, con conversión visible y aviso de diámetro nominal vs. interior. Salida elevada z₀ sobre el fondo.
- Modelo **Ideal (C_d = 1)** o **con coeficiente de descarga**.
- **Intervalo de medición** 1, 5, 10, 15, 30, 60 s o personalizado: regenera la tabla sin cambiar la física.
- **Reproductor** ▶ ⏸ ↺, barra de tiempo y velocidad 0,5×–500×. Todo sincronizado con el mismo t:
  3D, tarjetas (h, V, V evacuado, Q, v, dh/dt), marcador en las gráficas y fila resaltada en la tabla.
- **4 gráficas** (h, V, Q, v vs. t) con tooltip, zoom por arrastre, series activables y clic para mover t;
  superposición de tus mediciones reales.
- **Tabla** (N°, t s/min, h, %, V restante, V evacuado, Q, v, Δh, dh/dt) exportable a CSV.
- **Desarrollo matemático 01–15** en SI: datos → conversión → geometría → volumen → salida → Torricelli →
  caudal → EDO → separación → integración → condición inicial → h(t) → t_v → tabla → derivada numérica.
- Validaciones físicas (h₀ ≤ H, z₀ < h₀, d < ancho, C_d, Δt > 0…) y selector de 2/3/4/6 decimales.

**Análisis numérico** sobre la tabla calculada de tu tanque o sobre tus mediciones reales: regresión
lineal, diferenciación numérica, EDO lineal/exponencial/potencial resueltas por separación de variables,
comparación de modelos y **artículo científico exportable a PDF**. La metodología toma como referencia
a L. F. Plaza Gálvez (2017); la herramienta es autónoma y todo depende del tanque configurado.

## Uso

Es un sitio estático, sin compilación ni dependencias externas: KaTeX y Three.js están incluidos en `vendor/`.

- Local: abre `index.html` o ejecuta `python3 -m http.server` y entra a `http://localhost:8000`.
- Publicar: en GitHub ve a **Settings → Pages → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.

Para el PDF, en el cuadro de impresión elige **Guardar como PDF**, tamaño A4, activa “Gráficos de fondo”
y desactiva “Encabezados y pies de página”.

## Estructura

```
index.html        interfaz
css/styles.css    estilos de la app y del artículo (pantalla + impresión)
js/numeric.js     motor matemático: geometrías, Torricelli (con salida elevada), tabla teórica,
                  mínimos cuadrados, derivada numérica, modelos EDO (sin dependencias de la UI)
js/units.js       conversión de unidades y lectura de diámetros (mm, cm, m, pulgadas)
js/tank3d.js      escena 3D (tanque, agua, salida, chorro, regla)
js/ichart.js      gráficas interactivas
js/charts.js      gráficos SVG estáticos del artículo y diagrama 2D
js/article.js     generador del artículo
js/app.js         controlador: validación, reproductor y sincronización
vendor/           KaTeX 0.16.9 y Three.js r128 (licencia MIT)
```

### Añadir una geometría

En `js/numeric.js`, agrega una entrada a `TANKS` con `params`, `height`, `half(h)` (semiancho para
dibujar), `area(h)` (área de la superficie libre A_w), `vol(h)` y `F(u)` (primitiva de A_w(u²), o
usa la integración numérica que ya se aplica con salida elevada). La tabla, las gráficas, el desarrollo
y el 3D (perfil de revolución) la usan automáticamente.
