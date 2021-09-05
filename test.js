const queue = require('fastq').promise(worker, 1);

async function worker(arg) {
  console.log(arg);
}

async function run() {
  await queue.push(1);
  await queue.push(2);
  console.log(queue.length());
}

run();
