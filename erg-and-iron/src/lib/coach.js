// Turns readiness scores into plain coaching guidance.

import { addDays, relDay } from './dates.js';
import { ROW_TYPE, formatSplit, rowGuidance } from './rowing.js';
import { readinessOn, statusFor, workoutTitle } from './load.js';
import { getPlan } from './plan.js';

const wholeSplit = (sec) => formatSplit(sec, 0);

function cause(system, today) {
  if (!system.top || system.top.residual < 3) return '';
  const w = system.top.workout;
  const when = relDay(w.date, today);
  const title = workoutTitle(w);
  const plural = w.kind === 'lift' && w.sets > 1 ? 's' : '';
  return when === 'today' ? ` after today's ${title}${plural}` : ` after ${when}'s ${title}${plural}`;
}

/** Dashboard guidance: { status, headline, lines[] } */
export function coachReadiness(state, today) {
  const r = readinessOn(state.workouts, today);
  const plan = getPlan(state, today);
  const post = r.post.score;
  const cns = r.cns.score;
  const limiting = Math.min(post, cns);
  const status = statusFor(limiting);
  const lines = [];

  let opener = `Posterior chain at ${post}%${cause(r.post, today)}.`;
  const rowPending = plan.row && !plan.rowDone;
  const liftPending = plan.lift && !plan.liftDone;

  if (rowPending) {
    const type = ROW_TYPE[plan.row.type];
    const g = rowGuidance(plan.row.type, state.athlete.pr2k.split, limiting);
    const range = `${wholeSplit(g.fast)}–${wholeSplit(g.slow)}`;
    const rate = `${g.rate[0]}–${g.rate[1]} spm`;
    if (limiting < 50 && type.band === 'hard') {
      const easy = rowGuidance('ut2', state.athlete.pr2k.split, limiting);
      opener += ` Do not chase ${plan.row.title} today. Swap it for 30–40 minutes of UT2 at ${wholeSplit(easy.fast)}–${wholeSplit(easy.slow)}, or move it back 24 hours.`;
    } else if (g.trimmed) {
      opener += ` Cap today's ${plan.row.title} at a ${range} split and keep stroke rate at ${rate}.`;
    } else {
      opener += ` Green light for today's ${plan.row.title}: hold ${range} at ${rate}.`;
    }
  }
  lines.push(opener);

  if (liftPending) {
    if (post < 50) {
      lines.push(`Keep today's lift off the posterior chain: upper-body push and trunk work only.`);
    } else if (post < 75) {
      lines.push(`In the gym, cap leg-drive lifts at three sets each and rack the bar when speed drops.`);
    } else if (!rowPending) {
      lines.push(`Legs are fresh, so heavy catch and drive lifts are on.`);
    }
  }

  if (cns < 75) {
    lines.push(
      rowPending || liftPending
        ? `CNS at ${cns}%${cause(r.cns, today)}. Skip max-rate starts and grinding reps; keep every lift fast.`
        : `CNS at ${cns}%${cause(r.cns, today)}.`,
    );
  }

  if (!rowPending && !liftPending) {
    const next = readinessOn(state.workouts, addDays(today, 1));
    const done = plan.row || plan.lift ? `Today's work is logged.` : `Nothing is scheduled today.`;
    lines.push(
      `${done} With a normal night you start tomorrow at ${next.post.score}% posterior and ${next.cns.score}% CNS${
        limiting < 75 ? ', so sleep and fuel are the session now.' : '.'
      }`,
    );
  }

  const headline =
    status.id === 'primed'
      ? 'Primed to train'
      : status.id === 'manage'
        ? post <= cns
          ? 'Manage lower-body load'
          : 'Manage intensity'
        : post <= cns
          ? 'Posterior chain needs recovery'
          : 'CNS needs recovery';

  return { readiness: r, status, headline, lines };
}
