export class ReactiveTestProps<T extends object> {
  readonly value: T;

  constructor(initial: T) {
    this.value = $state(initial);
  }
}
