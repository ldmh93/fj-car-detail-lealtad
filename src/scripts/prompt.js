'use strict';

const readline = require('node:readline');

/** Pregunta en la terminal. Con { hidden: true } no muestra lo que se escribe (contraseñas). */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function args() {
  const out = {};
  const list = process.argv.slice(2);
  for (let i = 0; i < list.length; i++) {
    const m = list[i].match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (list[i + 1] && !list[i + 1].startsWith('--')) out[m[1]] = list[++i];
    else out[m[1]] = true;
  }
  return out;
}

module.exports = { ask, args };
