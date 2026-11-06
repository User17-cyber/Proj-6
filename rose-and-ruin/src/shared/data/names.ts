import { Rng } from '../rng';
import type { ClassId } from './classes';

// Period-appropriate names. Surnames lean on the great families who actually took each side.
const FIRST = [
  'Edmund', 'Henry', 'Richard', 'John', 'William', 'Thomas', 'Robert', 'Edward', 'Walter', 'Hugh',
  'Ralph', 'Geoffrey', 'Roger', 'Humphrey', 'Gilbert', 'Owain', 'Rhys', 'Nicholas', 'Simon', 'Giles',
  'Piers', 'Lionel', 'Reginald', 'Baldwin', 'Godfrey', 'Miles', 'Anthony', 'James', 'Philip', 'Stephen',
  'Alan', 'Bernard', 'Jasper', 'Oliver', 'Percival', 'Lancelot', 'Gervase', 'Ranulf', 'Osbert', 'Tristram',
];
const LANCASTER = [
  'Beaufort', 'Percy', 'Clifford', 'Courtenay', 'Tudor', 'Talbot', 'Dacre', 'Roos', 'Trollope', 'Tailboys',
  'Hungerford', 'Wenlock', 'Grey of Ruthin', 'Vaughan', 'de Vere', 'Stafford', 'Butler', 'Audley', 'Scales', 'Holland',
  'Tuchet', 'Fortescue', 'Whittingham', 'Morton', 'Neville of Westmorland',
];
const YORK = [
  'Neville', 'Herbert', 'Howard', 'Hastings', 'Mowbray', 'Bourchier', 'Stanley', 'Grey', 'Woodville', 'Fauconberg',
  'Devereux', 'Brandon', 'Lovell', 'Ratcliffe', 'Catesby', 'Montagu', 'Fitzhugh', 'Parr', 'Harrington', 'Scrope',
  'Mortimer', 'Ogle', 'Conyers', 'Tyrell', 'Brackenbury',
];
const YEOMEN_FIRST = ['Will', 'Tom', 'Jack', 'Hob', 'Wat', 'Dick', 'Ned', 'Kit', 'Hal', 'Rafe', 'Sim', 'Davy', 'Gib', 'Robin', 'Lewis'];
const YEOMEN_OF = [
  'Kendal', 'Cheshire', 'Macclesfield', 'Sherwood', 'Ludlow', 'Wakefield', 'Tewkesbury', 'Barnet', 'Towton', 'Pontefract',
  'Hexham', 'Knaresborough', 'Bury', 'Stamford', 'Lincoln', 'Gloucester', 'Shrewsbury', 'Hereford', 'Monmouth', 'Ripon',
];
const YEOMEN_TRADE = ['Fletcher', 'Bowyer', 'Archer', 'Smith', 'Tanner', 'Miller', 'Fowler', 'Forester', 'Hayward', 'Cooper'];

export function knightName(rng: Rng, team: number, cls: ClassId, used: Set<string>): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    let name: string;
    if (cls === 'longbowman') {
      name = rng.chance(0.5)
        ? `${rng.pick(YEOMEN_FIRST)} of ${rng.pick(YEOMEN_OF)}`
        : `${rng.pick(YEOMEN_FIRST)} ${rng.pick(YEOMEN_TRADE)}`;
    } else {
      const sur = rng.pick(team === 0 ? LANCASTER : YORK);
      name = cls === 'banneret' && rng.chance(0.45)
        ? `Lord ${rng.pick(FIRST)} ${sur}`
        : `Sir ${rng.pick(FIRST)} ${sur}`;
    }
    if (!used.has(name)) { used.add(name); return name; }
  }
  const fallback = `Sir ${rng.pick(FIRST)} the ${used.size}th`;
  used.add(fallback);
  return fallback;
}
