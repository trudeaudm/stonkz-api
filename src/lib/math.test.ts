import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traderDirectionFromAmounts } from '../lib/math.js';

describe('traderDirectionFromAmounts', () => {
  it('treats positive token-side BalanceDelta as buy (MOONER = currency1)', () => {
    // Deployer 0.001 ETH buy: amount0=-0.00099 ETH, amount1=+MOONER
    const dir = traderDirectionFromAmounts(
      -990000000000000n,
      46668261087766444698196n,
      false,
    );
    assert.equal(dir, 'buy');
  });

  it('treats negative token-side BalanceDelta as sell (MOONER = currency1)', () => {
    const dir = traderDirectionFromAmounts(
      3940234266266616n,
      -185466143954826472424085n,
      false,
    );
    assert.equal(dir, 'sell');
  });

  it('orients by tokenIsCurrency0 when token is currency0', () => {
    assert.equal(traderDirectionFromAmounts(100n, -50n, true), 'buy');
    assert.equal(traderDirectionFromAmounts(-100n, 50n, true), 'sell');
  });
});
