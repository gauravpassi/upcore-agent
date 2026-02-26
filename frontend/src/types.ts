export interface ToolEvent {
  id: string;
  tool: string;
  status: 'running' | 'done';
  result?: string;
}

export interface AttachedImage {
  /** base64-encoded image data (no data: URI prefix) */
  data: string;
  /** MIME type */
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  /** Original filename for display */
  name: string;
  /** Object URL for preview (frontend only) */
  previewUrl: string;
}

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  images?: AttachedImage[];
  toolEvents?: ToolEvent[];
  timestamp: Date;
  isStreaming?: boolean;
}
