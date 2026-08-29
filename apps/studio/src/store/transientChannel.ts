/**
 * The channel that carries values during a continuous drag.
 *
 * Dragging a slider or an object produces a value per pointer move — far more
 * often than React should re-render. Those intermediate values go here
 * instead: the renderer subscribes directly and redraws, while React sees only
 * the start and the end of the drag.
 *
 * It also settles the undo behaviour. Intermediate values never reach the
 * document, so a whole drag commits as one history entry rather than one per
 * pointer move.
 */

export interface TransientEdit {
  readonly objectId: string;
  /** Parameter or property name being dragged. */
  readonly key: string;
  readonly value: unknown;
}

export type TransientListener = (edits: readonly TransientEdit[]) => void;

export class TransientChannel {
  private readonly listeners = new Set<TransientListener>();
  private pending: TransientEdit[] = [];
  private active = false;

  /** Whether a drag is in progress. */
  get isDragging(): boolean {
    return this.active;
  }

  /** The values written since the drag began, latest per key. */
  get currentEdits(): readonly TransientEdit[] {
    return this.pending;
  }

  subscribe(listener: TransientListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Marks the start of a drag. React renders once, here. */
  begin(): void {
    this.active = true;
    this.pending = [];
  }

  /**
   * Publishes an intermediate value. Subscribers are notified synchronously;
   * React is not involved.
   */
  push(edit: TransientEdit): void {
    if (!this.active) return;

    const index = this.pending.findIndex(
      (existing) => existing.objectId === edit.objectId && existing.key === edit.key,
    );
    if (index >= 0) this.pending[index] = edit;
    else this.pending.push(edit);

    this.emit();
  }

  /**
   * Ends the drag and hands back everything that accumulated, for the caller to
   * commit as a single edit.
   */
  end(): readonly TransientEdit[] {
    const committed = this.pending;
    this.active = false;
    this.pending = [];
    this.emit();
    return committed;
  }

  /** Abandons the drag without committing, e.g. on Escape. */
  cancel(): void {
    this.active = false;
    this.pending = [];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.pending);
  }
}

/** The application's channel. */
export const transientChannel = new TransientChannel();
