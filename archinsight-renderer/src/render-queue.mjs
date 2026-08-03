export class RenderQueueFullError extends Error {
  constructor() {
    super('renderer queue is full');
    this.name = 'RenderQueueFullError';
  }
}

export class RenderQueue {
  #active = 0;
  #pending = [];

  constructor(maxConcurrent, maxQueued) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueued = maxQueued;
  }

  get active() {
    return this.#active;
  }

  get queued() {
    return this.#pending.length;
  }

  run(task) {
    if (this.#active < this.maxConcurrent) {
      return this.#start(task);
    }
    if (this.#pending.length >= this.maxQueued) {
      return Promise.reject(new RenderQueueFullError());
    }
    return new Promise((resolve, reject) => {
      this.#pending.push({ task, resolve, reject });
    });
  }

  #start(task) {
    this.#active += 1;
    return Promise.resolve()
      .then(task)
      .finally(() => {
        this.#active -= 1;
        this.#drain();
      });
  }

  #drain() {
    const next = this.#pending.shift();
    if (!next) {
      return;
    }
    this.#start(next.task).then(next.resolve, next.reject);
  }
}
