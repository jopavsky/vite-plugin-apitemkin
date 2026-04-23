import { defineScenarios } from 'vite-plugin-apitemkin';

interface Order {
  id: number;
  item: string;
  total: number;
}

export default defineScenarios<Order[]>({
  default: [
    { id: 1, item: 'Lovelace pen', total: 12.5 },
    { id: 2, item: 'Linux mug', total: 9.0 },
  ],
  empty: [],
  error: {
    status: 500,
    body: { error: 'Order service unavailable' } as unknown as Order[],
  },
  slow: {
    delay: 2000,
    body: [{ id: 1, item: 'eventually arrives', total: 1 }],
  },
});
