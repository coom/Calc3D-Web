import { readGcodeChunks, cleanMaterialName, resolveMaterialName } from './gcode-files';
import { GCODE_CHUNK_BYTES } from '@calc3d/common';

const mat = (id: number, name: string) => ({ id, name, pricePerKg: 20, sortOrder: id });

describe('gcode-files', () => {
  it("lit tête et queue d'un gros fichier sans charger le milieu", async () => {
    const head = '; filament_type = PETG\n'; const tail = '\n; estimated printing time (normal mode) = 10m\n';
    const big = head + 'G1 X0\n'.repeat(100_000) + tail;
    const text = await readGcodeChunks(new File([big], 'piece.gcode'));
    expect(text.startsWith(head)).toBe(true);
    expect(text.endsWith(tail)).toBe(true);
    expect(text.length).toBeLessThanOrEqual(2 * GCODE_CHUNK_BYTES + 1);
  });
  it('un petit fichier est lu une seule fois', async () => {
    expect(await readGcodeChunks(new File(['; TIME:60\n'], 'p.gcode'))).toBe('; TIME:60\n');
  });
  it('cleanMaterialName retire les caractères de contrôle et plafonne à 60', () => {
    expect(cleanMaterialName(' PLA' + String.fromCharCode(0) + ' [Basic] ')).toBe('PLA  [Basic]');
    expect(cleanMaterialName('x'.repeat(80))).toHaveLength(60);
  });
  it('resolveMaterialName : égalité puis inclusion insensibles à la casse, sinon null', () => {
    const catalog = [mat(1, 'PLA'), mat(2, 'PETG-CF'), mat(3, 'Nylon (PA)')];
    expect(resolveMaterialName('pla', catalog)?.name).toBe('PLA');
    expect(resolveMaterialName('PLA [Basic]', catalog)?.name).toBe('PLA');
    expect(resolveMaterialName('petg', catalog)?.name).toBe('PETG-CF');
    expect(resolveMaterialName('ASA', catalog)).toBeNull();
    expect(resolveMaterialName('', catalog)?.name).toBe('PLA');
  });
});
