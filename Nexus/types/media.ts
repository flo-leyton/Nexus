export type NexusMediaSource = 'import' | 'capture' | 'output';

export type NexusMediaResourceType = 'image' | 'video';

export type NexusMediaAsset = {
  id: string;
  sessionId: string;
  source: NexusMediaSource;
  resourceType: NexusMediaResourceType;
  publicId: string;
  url: string;
  fileName?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  nodeId?: string;
  role?: string;
  createdAt: string;
};
