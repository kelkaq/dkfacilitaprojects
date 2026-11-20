import assert from 'node:assert/strict';
import { isValidCnpj, isValidCpf, validateHolderDocument } from '../server/lib/brazilDocument.ts';

assert.equal(isValidCpf('529.982.247-25'), true);
assert.equal(isValidCpf('529.982.247-24'), false);
assert.equal(isValidCpf('111.111.111-11'), false);
assert.equal(isValidCnpj('11.222.333/0001-81'), true);
assert.equal(isValidCnpj('11.222.333/0001-80'), false);
assert.equal(isValidCnpj('00.000.000/0000-00'), false);
assert.equal(validateHolderDocument('PF', '529.982.247-25'), '52998224725');
assert.throws(() => validateHolderDocument('PJ', '529.982.247-25'));
process.stdout.write('Validação de CPF/CNPJ passou.\n');
