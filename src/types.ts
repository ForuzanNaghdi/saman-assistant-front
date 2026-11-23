import type { DocOut } from './api/types';

export interface DisplayMessage {
  key: string;
  recordId?: string;
  userQuery: string;
  answer: string | null;
  status: 'pending' | 'completed' | 'failed';
  /** Deltas accumulated while the answer is still streaming. */
  streamingText: string;
  retrievedDocs: DocOut[];
  note?: {
    message: string;
    code?: string;
  };
}
