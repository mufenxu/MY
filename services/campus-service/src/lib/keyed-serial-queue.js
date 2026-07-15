export class KeyedSerialQueue {
  #tails = new Map();

  get size() {
    return this.#tails.size;
  }

  async run(key, task) {
    const previous = this.#tails.get(key) || Promise.resolve();
    const operation = previous.catch(() => undefined).then(task);
    this.#tails.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.#tails.get(key) === operation) this.#tails.delete(key);
    }
  }
}
