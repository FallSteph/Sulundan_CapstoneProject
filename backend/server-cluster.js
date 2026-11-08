const cluster = require("cluster");
const os = require("os");
const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Primary process ${process.pid} is running`);

  // Fork workers for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork(); // Restart the worker if it dies
  });
} else {
  // Worker processes will run the normal server
  console.log(`Worker process ${process.pid} started`);
  require("./server");
}
