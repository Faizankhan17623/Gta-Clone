// Local game funds only. Online balances require a server-confirmed withdrawal.
export const CASH_CAP = 10000;
export function availableFunds(world, cost = 0) {
  return Math.max(0, world.money || 0) + (cost > CASH_CAP ? Math.max(0, world.bank?.balance || 0) : 0);
}
export function spendMoney(world, cost) {
  if (!Number.isFinite(cost) || cost < 0 || availableFunds(world, cost) < cost) return false;
  const cash = Math.min(Math.max(0, world.money || 0), cost);
  world.money -= cash;
  if (cost > cash) world.bank.balance -= cost - cash;
  return true;
}
