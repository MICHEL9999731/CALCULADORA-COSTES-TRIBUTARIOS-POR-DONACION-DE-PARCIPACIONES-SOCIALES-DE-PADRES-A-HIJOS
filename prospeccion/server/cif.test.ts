import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarCif, pareceCif } from './cif.ts';

test('valida CIF reales de sociedades anónimas', () => {
  const telefonica = analizarCif('A28015865');
  assert.equal(telefonica.valido, true);
  assert.equal(telefonica.provinciaInscripcion, 'Madrid');
  assert.match(telefonica.formaJuridica ?? '', /anónima/);

  const inditex = analizarCif('A-15.075.062');
  assert.equal(inditex.valido, true);
  assert.equal(inditex.cif, 'A15075062');
  assert.equal(inditex.provinciaInscripcion, 'A Coruña');

  assert.equal(analizarCif('A46103834').valido, true); // Mercadona
});

test('acepta el prefijo ES de NIF-IVA', () => {
  assert.equal(analizarCif('ESA28015865').valido, true);
});

test('detecta dígito de control erróneo', () => {
  const r = analizarCif('A28015866');
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'El dígito de control no coincide');
});

test('rechaza formatos que no son CIF', () => {
  assert.equal(pareceCif('Mercadona'), false);
  assert.equal(pareceCif('12345678Z'), false);
  assert.equal(analizarCif('Mercadona').valido, false);
});
