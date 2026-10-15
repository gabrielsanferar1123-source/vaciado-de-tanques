# Laboratorio de Vaciado de Tanques

Aplicación web que modela el vaciado de un tanque siguiendo paso a paso la metodología de
**L. F. Plaza Gálvez, “Modelo matemático para vaciado de tanques”, _Scientia et Technica_ 22(1), 2017**,
la extiende a cualquier geometría y genera automáticamente el **artículo científico exportable a PDF**.

## Qué hace

1. **Tanque**: cilindro vertical, prisma rectangular, tronco de cono (balde), cono, esfera o cilindro horizontal.
   Simulación animada del vaciado (h, V, Q, A_w, dh/dt en tiempo real).
2. **Teoría (Torricelli)**: derivación con los valores del tanque, de dV/dt = −C_d A₀√(2gh) a la solución
   cerrada t(h) de cada geometría y el tiempo de vaciado.
3. **Datos**: datos reales del artículo, simulación con ruido de medición o datos propios pegados desde Excel.
4. **Regresión lineal** h = at + b (ecuación 5 del artículo).
5. **Diferenciación numérica** con diferencias centradas (Tablas 2 y 3).
6. **EDO por regresión** lineal, exponencial y potencial de −dh/dt = f(h), resueltas por separación de
   variables con h(0) = h₀ (Cuadros 4 y 5), con cada paso desarrollado.
7. **Resultados**: Cuadro 6 (modelos contra datos reales), R², r², RMSE, tiempos de vaciado y C_d ajustado.
8. **Artículo**: Resumen/Abstract, I–VIII, figuras y tablas numeradas, conclusiones y referencias,
   generados con los resultados actuales. Botón **Exportar PDF** (formato revista A4 a dos columnas).

Con los datos del artículo la aplicación reproduce sus resultados:
h = −4,0436t + 42,88; −dh/dt = 0,07283h + 2,57805 · 2,63151e^0,01965h · 1,88614h^0,27429;
h = 81,097e^−0,07283t − 35,397 · −50,89 ln(0,05171t + 0,40738) · (−1,36879t + 16,0184)^1,37796.

## Uso

Es un sitio estático, sin compilación ni dependencias externas: KaTeX está incluido en `vendor/`.

- Local: abre `index.html` o ejecuta `python3 -m http.server` y entra a `http://localhost:8000`.
- Publicar: en GitHub ve a **Settings → Pages → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.

Para el PDF, en el cuadro de impresión elige **Guardar como PDF**, tamaño A4, activa “Gráficos de fondo”
y desactiva “Encabezados y pies de página”.

## Estructura

```
index.html        interfaz
css/styles.css    estilos de la app y del artículo (pantalla + impresión)
js/numeric.js     geometrías, Torricelli, mínimos cuadrados, derivada numérica, modelos EDO
js/charts.js      gráficos SVG y dibujo del tanque
js/article.js     generador del artículo
js/app.js         controlador (cálculo en tiempo real)
vendor/katex/     KaTeX 0.16.9 (licencia MIT)
```
