import * as Logger from './logger';
import { errorString, sendNotification } from './helpers';

export class TaskLoop {
  private handle: NodeJS.Timeout | undefined;
  private started = false;
  constructor(private task: () => Promise<unknown>, private pause: number) {}

  runTask = () => {
    this.task().then(
      () => {
        if (this.started) {
          this.handle = setTimeout(this.runTask, this.pause);
        }
      },
      (err) => {
        Logger.error(`Error in runTask: ${errorString(err)}`);
        sendNotification(`Error in runTask: ${errorString(err)}`);
        if (this.started) {
          this.handle = setTimeout(this.runTask, this.pause);
        }
      }
    );
  };

  start = () => {
    sendNotification('Task-loop start was called');
    if (!this.started) {
        this.started = true;
        this.handle = setTimeout(this.runTask, 10 * 1000);
    }
  };

  stop = () => {
    this.started = false;
    sendNotification('Task-loop stop was called');
    if (this.handle !== undefined) {
      clearTimeout(this.handle);
    }
  };
}
