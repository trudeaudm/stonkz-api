/** Minimal ABIs — field order pinned to stonkz-site/app/abi (Express V4 generation). */

export const expressFactoryAbi = [
  {
    type: 'event',
    name: 'ExpressListed',
    inputs: [
      { name: 'listing', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'userSalt', type: 'bytes32', indexed: false },
      { name: 'salt', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'poolManager',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

export const directListingAbi = [
  { type: 'function', name: 'startMcap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'startPriceWad', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'listed', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'creatorReserve', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'liquidityLocked', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'createSidePool', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'sidePoolBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'sidePoolDeployed', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'pairToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'mainKey',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'sideKey',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
    ],
  },
  { type: 'function', name: 'ethUsdWad', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'creatorReserveState',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'mode', type: 'uint8' },
          { name: 'vestDuration', type: 'uint64' },
          { name: 'unlockedAt', type: 'uint64' },
          { name: 'total', type: 'uint256' },
          { name: 'claimed', type: 'uint256' },
          { name: 'filed', type: 'bool' },
        ],
      },
    ],
  },
] as const;

export const launchTokenAbi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const expressFactoryReadAbi = [
  {
    type: 'function',
    name: 'currentEthUsdWad',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const poolManagerSwapAbi = [
  {
    type: 'event',
    name: 'Swap',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'amount0', type: 'int128', indexed: false },
      { name: 'amount1', type: 'int128', indexed: false },
      { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
      { name: 'liquidity', type: 'uint128', indexed: false },
      { name: 'tick', type: 'int24', indexed: false },
      { name: 'fee', type: 'uint24', indexed: false },
    ],
  },
] as const;

/**
 * On-chain ExpressListed topics[0] from V3 factory log @ block 37312001.
 * Scanner refuses to run on mismatch (stonkz-site lesson).
 */
export const EXPRESS_LISTED_TOPIC0_ANCHOR: `0x${string}` =
  `0x5b9ab641ea31574caf64ffdb8a296ce156508238a1b9bb7dc0ab2de836f6fcba`;

export const POOL_SWAP_TOPIC0: `0x${string}` =
  `0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f`;

export const expressListedEvent = expressFactoryAbi.find(
  (x): x is Extract<(typeof expressFactoryAbi)[number], { type: 'event'; name: 'ExpressListed' }> =>
    x.type === 'event' && x.name === 'ExpressListed',
)!;

export const poolSwapEvent = poolManagerSwapAbi[0]!;
