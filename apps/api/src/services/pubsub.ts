import { PubSub } from '@google-cloud/pubsub';
import { loadEnv, type PubSubTopic } from '@auto-recruit/config';

let _client: PubSub | null = null;

function getClient(): PubSub {
  if (_client) return _client;
  const env = loadEnv();
  _client = new PubSub({ projectId: env.GCP_PROJECT_ID });
  return _client;
}

export async function publishMessage<T extends object>(
  topic: PubSubTopic,
  data: T,
  attributes?: Record<string, string>,
): Promise<string> {
  const client = getClient();
  const buffer = Buffer.from(JSON.stringify(data));
  const messageId = await client.topic(topic).publishMessage({
    data: buffer,
    attributes,
  });
  console.log(`[pubsub] published to ${topic}: ${messageId}`);
  return messageId;
}
