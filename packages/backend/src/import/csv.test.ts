import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv (format Export-Csv)', () => {
  it('lit en-tête, guillemets, guillemets doublés, virgules dans les champs, CRLF et BOM', () => {
    const text = '\uFEFF"Id","Projet","Commentaire"\r\n"1","Boîte ""XL"", bleue","a, b"\r\n"2","Simple",""\r\n';
    const r = parseCsv(text);
    expect(r.header).toEqual(['Id', 'Projet', 'Commentaire']);
    expect(r.rows).toEqual([{ line: 2, cells: ['1', 'Boîte "XL", bleue', 'a, b'] }, { line: 3, cells: ['2', 'Simple', ''] }]);
    expect(r.errors).toEqual([]);
  });
  it('accepte les champs sans guillemets et les retours à la ligne dans un champ cité', () => {
    const r = parseCsv('a,b\n1,"ligne 1\nligne 2"\n');
    expect(r.rows[0].cells).toEqual(['1', 'ligne 1\nligne 2']);
  });
  it("signale une ligne dont le nombre de colonnes diffère de l'en-tête, sans arrêter", () => {
    const r = parseCsv('a,b,c\n1,2,3\n4,5\n6,7,8\n');
    expect(r.rows.map((x) => x.line)).toEqual([2, 4]);
    expect(r.errors).toEqual([{ line: 3, reason: 'expected 3 columns, got 2' }]);
  });
  it('fichier vide ou sans en-tête', () => {
    expect(parseCsv('')).toEqual({ header: [], rows: [], errors: [{ line: 1, reason: 'empty file' }] });
  });
});
