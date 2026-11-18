import { sectSupplyStatus } from '../sim/sectEconomy.js';

const amount = value => Number.isFinite(value) ? value.toFixed(3) : '未记账';
/** Strings from real residents and the most recent settled supply ledger. */
export function sectSupplyFacts(world, sect) {
  const status = sectSupplyStatus(world, sect);
  const ledger = status.measuredDay === null ? '粮草收支尚未记账'
    : `粮草/日 入 ${amount(status.suppliedPerDay)} · 耗 ${amount(status.consumedPerDay)} · 净 ${status.netPerDay > 0 ? '+' : ''}${amount(status.netPerDay)}`;
  const recruits = status.recruitedTotal === null ? '后继流入未记账' : `记账以来入门 ${status.recruitedTotal} 人`;
  const supply = status.supplyCutOff ? '地方断供' : status.canRecruit ? '地方可供养后继' : '暂缓招新';
  return { practitioners: status.practitioners, ledger, succession: `${recruits} · ${supply}` };
}
