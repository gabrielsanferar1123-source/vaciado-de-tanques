/* Conversión de unidades de longitud. El motor trabaja en cm; la interfaz
   acepta mm, cm, m y pulgadas (incluidas fracciones como 3/4" o 1 1/4"). */
(function (global) {
  'use strict';

  const TO_CM = { mm: 0.1, cm: 1, m: 100, in: 2.54 };
  const NAME = { mm: 'mm', cm: 'cm', m: 'm', in: '"' };

  const toCm = (v, u) => v * TO_CM[u];
  const fromCm = (v, u) => v / TO_CM[u];

  /* Interpreta un número que puede venir con coma decimal o como fracción. */
  function parseNumber(s) {
    s = String(s).trim().replace(',', '.');
    let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/); // 1 1/4
    if (m) return +m[1] + (+m[2]) / (+m[3]);
    m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/); // 3/4
    if (m) return (+m[1]) / (+m[2]);
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return parseFloat(s);
    return NaN;
  }

  /* Interpreta una longitud escrita con o sin unidad: "20 mm", "3/4\"", "1 in", "0,02 m", "25".
     Devuelve { cm, unit, value, text, inches } o { error }. */
  function parseLength(text, defUnit = 'mm') {
    const raw = String(text || '').trim();
    if (!raw) return { error: 'Escribe un valor.' };
    let s = raw.toLowerCase().replace(/[”″“]/g, '"').replace(/pulgadas?|pulg\.?|inch(es)?/g, 'in');
    let unit = defUnit;
    const um = s.match(/(mm|cm|m|in|")\s*$/);
    if (um) { unit = um[1] === '"' ? 'in' : um[1]; s = s.slice(0, um.index).trim(); }
    const v = parseNumber(s);
    if (!Number.isFinite(v)) return { error: `No se entiende “${raw}”. Ejemplos válidos: 20 mm, 2,5 cm, 0,02 m, 3/4", 1 1/4".` };
    if (v <= 0) return { error: 'El valor debe ser mayor que cero.' };
    return { cm: toCm(v, unit), unit, value: v, text: raw, inches: unit === 'in' };
  }

  global.Units = { TO_CM, NAME, toCm, fromCm, parseNumber, parseLength };
})(window);
