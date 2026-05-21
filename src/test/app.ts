import { createServer, type ServerOptions } from '../server.js';

type TestAppOptions = Omit<
  ServerOptions,
  'logger' | 'trustProxy' | 'adminToken' | 'devices' | 'provisioning' | 'woocommerceWebhookSecret'
> &
  Partial<
    Pick<
      ServerOptions,
      'logger' | 'trustProxy' | 'adminToken' | 'devices' | 'provisioning' | 'woocommerceWebhookSecret'
    >
  >;

export async function createTestApp(options: TestAppOptions) {
  return createServer({
    logger: false,
    trustProxy: false,
    adminToken: 'test-admin-token-0123456789',
    devices: {
      async registerDevice() {
        throw new Error('Test device registry was not configured');
      }
    },
    woocommerceWebhookSecret: 'test-woocommerce-webhook-secret',
    provisioning: {
      async provisionWooOrder() {
        throw new Error('Test provisioning service was not configured');
      }
    },
    ...options
  });
}
