# STONKZ API — Step B verify report

Generated: 2026-08-20T20:00:18.515Z

## Stack choice

Fastify (typed schemas, lower JSON overhead, first-class async; Express would work but Fastify fits a public read API better)

## Hidden generation filter

```json
{
  "listings_status": 200,
  "listings_total": 0,
  "mooner_status": 404,
  "health_generations": [
    {
      "name": "express-v1",
      "visible": false,
      "tracked": true,
      "factory_address": "0xdaA8C981c3ae077741ebA78283b6c5876EB727b4",
      "deploy_block": "35168264"
    },
    {
      "name": "express-v2",
      "visible": false,
      "tracked": true,
      "factory_address": "0x3eAb3d13e70BBEEB9e6203cBf11d6613523AC5Fd",
      "deploy_block": "37184159"
    },
    {
      "name": "express-v3",
      "visible": false,
      "tracked": true,
      "factory_address": "0xb5105a1954e0f4045CB902606afB4178F471A338",
      "deploy_block": "37291899"
    },
    {
      "name": "express-v4",
      "visible": false,
      "tracked": true,
      "factory_address": "0xEe2590c39E1485ed2F9cdaA684ab7B91d284E94a",
      "deploy_block": "38007365"
    }
  ],
  "generations_hidden": 4,
  "pass": true
}
```

## Timings

```json
{
  "listings_ms": 3,
  "candles_1d_ms": 3
}
```

## GET /health (excerpt)

```json
{
  "status": 200,
  "ms": 7,
  "body": {
    "ok": true,
    "db": "up",
    "chain_head": "41691199",
    "blocks_behind_head": "1059",
    "counts": {
      "generations": 4,
      "generations_visible": 1,
      "generations_hidden": 3,
      "listings": 3,
      "swaps": 48,
      "candles": 106
    },
    "generations": [
      {
        "name": "express-v1",
        "visible": false,
        "tracked": true,
        "factory_address": "0xdaA8C981c3ae077741ebA78283b6c5876EB727b4",
        "deploy_block": "35168264"
      },
      {
        "name": "express-v2",
        "visible": false,
        "tracked": true,
        "factory_address": "0x3eAb3d13e70BBEEB9e6203cBf11d6613523AC5Fd",
        "deploy_block": "37184159"
      },
      {
        "name": "express-v3",
        "visible": false,
        "tracked": true,
        "factory_address": "0xb5105a1954e0f4045CB902606afB4178F471A338",
        "deploy_block": "37291899"
      },
      {
        "name": "express-v4",
        "visible": true,
        "tracked": true,
        "factory_address": "0xEe2590c39E1485ed2F9cdaA684ab7B91d284E94a",
        "deploy_block": "38007365"
      }
    ],
    "cursors_sample": [
      {
        "scope": "listings:0xee2590c39e1485ed2f9cdaa684ab7b91d284e94a",
        "last_block": "41690140",
        "updated_at": "2026-08-20T19:59:23.495Z",
        "blocks_behind": "1059"
      },
      {
        "scope": "swaps:0x41522a9298521426378fb4b6515b9ace72d50182737443d26f577c8ff387073d",
        "last_block": "41690140",
        "updated_at": "2026-08-20T20:00:04.642Z",
        "blocks_behind": "1059"
      },
      {
        "scope": "swaps:0x892ae99759b0bc92aa582788f0e4fed08642f3bd03b654a79d697114bcd63ed1",
        "last_block": "41690140",
        "updated_at": "2026-08-20T19:59:58.050Z",
        "blocks_behind": "1059"
      }
    ]
  }
}
```

## GET /listings

```json
{
  "status": 200,
  "ms": 12,
  "body": {
    "items": [
      {
        "token_address": "0x46634229969b6d375bbb460ef3ebc97ccb4cb11b",
        "listing_address": "0x86d0a2fe8bb314ba936ee95e7c475772bbe9df78",
        "symbol": "MP",
        "name": "match price",
        "total_supply": "100000000000000000000000000",
        "listed_supply": "95000000000000000000000000",
        "tier": "4k",
        "start_mcap_usd": "4000000000000000000000",
        "liquidity_locked": true,
        "side_pool_bps": 500,
        "launch_block": "41639796",
        "launched_at": "2026-08-20T18:34:44.000Z",
        "generation": "express-v4",
        "spot": {
          "price_wad": "17397649194845494087147956393",
          "pool_id": "0xe827f269ecafeb1480cc05ab3b49715d10f9be645c8319ff9ae211b8dd9674ae",
          "pool": "main",
          "pair_currency": "eth",
          "liquidity": "12529412004665447202905",
          "as_of": "2026-08-20T18:37:37.000Z"
        },
        "volume_24h_pair": "2824653779285352",
        "change_24h_pct": "-0.1021"
      },
      {
        "token_address": "0x46635a7b299a680fe86ffed30cc91e53fb6315e4",
        "listing_address": "0xce1476acb40275bef4a90e08eb8b588f7af1f891",
        "symbol": "THOOK",
        "name": "test hook",
        "total_supply": "100000000000000000000000000",
        "listed_supply": "95000000000000000000000000",
        "tier": "4k",
        "start_mcap_usd": "4000000000000000000000",
        "liquidity_locked": true,
        "side_pool_bps": 500,
        "launch_block": "41579970",
        "launched_at": "2026-08-20T16:54:47.000Z",
        "generation": "express-v4",
        "spot": {
          "price_wad": "0",
          "pool_id": "0xdc78d3c81113125b71ebd823866efa3aa44f22d59ce0b100b4c7fea8438f83da",
          "pool": "side",
          "pair_currency": "usdg",
          "liquidity": "0",
          "as_of": "2026-08-20T18:33:33.000Z"
        },
        "volume_24h_pair": "111826084995826228380483",
        "change_24h_pct": "-100.0000"
      },
      {
        "token_address": "0x46639f9c43a688f185c83254564a6d743a27ce36",
        "listing_address": "0xc85eca7573717e9094f11eeecea960011e4c9e07",
        "symbol": "MOONER",
        "name": "Mooner boi",
        "total_supply": "100000000000000000000000000",
        "listed_supply": "95000000000000000000000000",
        "tier": "4k",
        "start_mcap_usd": "4000000000000000000000",
        "liquidity_locked": true,
        "side_pool_bps": 500,
        "launch_block": "39414913",
        "launched_at": "2026-08-18T04:34:31.000Z",
        "generation": "express-v4",
        "spot": {
          "price_wad": "36334239867499",
          "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
          "pool": "side",
          "pair_currency": "usdg",
          "liquidity": "30073674456279135",
          "as_of": "2026-08-20T02:28:16.000Z"
        },
        "volume_24h_pair": "5246923515295403436011372",
        "change_24h_pct": "0.3891"
      }
    ],
    "pagination": {
      "limit": 5,
      "offset": 0,
      "total": 3
    },
    "amounts": "strings"
  }
}
```

## GET /listings/:token ($MOONER)

```json
{
  "status": 200,
  "ms": 459,
  "body": {
    "token_address": "0x46639f9c43a688f185c83254564a6d743a27ce36",
    "listing_address": "0xc85eca7573717e9094f11eeecea960011e4c9e07",
    "symbol": "MOONER",
    "name": "Mooner boi",
    "total_supply": "100000000000000000000000000",
    "listed_supply": "95000000000000000000000000",
    "tier": "4k",
    "start_mcap_usd": "4000000000000000000000",
    "liquidity_locked": true,
    "side_pool_bps": 500,
    "launch_block": "39414913",
    "launched_at": "2026-08-18T04:34:31.000Z",
    "generation": "express-v4",
    "spot": {
      "price_wad": "36334239867499",
      "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
      "pool": "side",
      "pair_currency": "usdg",
      "liquidity": "30073674456279135",
      "as_of": "2026-08-20T02:28:16.000Z"
    },
    "volume_24h_pair": "5246923515295403436011372",
    "change_24h_pct": "0.3891",
    "creator_address": "0x8f5077ec52543d6393f483dc2b958bf8cad2d232",
    "decimals": 18,
    "start_price_wad": "21117828765",
    "eth_usd_wad_stamped": "1894134119742894886354",
    "eth_usd_wad_live": "2321859907559960833973",
    "creator_reserve": "0",
    "creator_reserve_state": {
      "mode": "instant",
      "vest_duration_sec": "0",
      "unlocked_at": "0",
      "total": "0",
      "claimed": "0",
      "filed": false,
      "available": "0"
    },
    "side_pool_deployed": true,
    "launch_tx": "0x3d453e2ddb678577b2916f70f3231fbcf4cb75ee7880c2de3bfb1b9ddaa6db79",
    "main_pool_id": "0xb3b57975cfd5701ef9f3f2dfcc9153960eb79f8a739bb2ced0c74fd0f93147f4",
    "side_pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
    "main_pool_key": {
      "fee": 0,
      "hooks": "0x4663c4c5Cb6F826d148cD38aDaF9157f483d0088",
      "currency0": "0x0000000000000000000000000000000000000000",
      "currency1": "0x46639f9c43A688F185c83254564A6D743A27Ce36",
      "tickSpacing": 60
    },
    "side_pool_key": {
      "fee": 3000,
      "hooks": "0x0000000000000000000000000000000000000000",
      "currency0": "0x46639f9c43A688F185c83254564A6D743A27Ce36",
      "currency1": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      "tickSpacing": 60
    },
    "pools": {
      "main": {
        "price_wad": "21203603018002113405520010306",
        "liquidity": "13833233077531051342885",
        "pool_id": "0xb3b57975cfd5701ef9f3f2dfcc9153960eb79f8a739bb2ced0c74fd0f93147f4",
        "as_of": "2026-08-20T02:27:43.000Z",
        "pair_currency": "eth"
      },
      "side": {
        "price_wad": "36334239867499",
        "liquidity": "30073674456279135",
        "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
        "as_of": "2026-08-20T02:28:16.000Z",
        "pair_currency": "usdg"
      }
    }
  }
}
```

## GET /listings/:token/candles ($MOONER, each timeframe)

```json
{
  "1m": {
    "status": 200,
    "ms": 7,
    "candle_count": 17,
    "pool": "side",
    "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
    "sample": [
      {
        "bucket_start": "2026-08-18T04:36:00.000Z",
        "open": "36642378280851",
        "high": "36642378280851",
        "low": "36642378280851",
        "close": "36642378280851",
        "volume_pair": "1163129",
        "swap_count": 1
      },
      {
        "bucket_start": "2026-08-18T04:39:00.000Z",
        "open": "38675605987009",
        "high": "38675605987009",
        "low": "38675605987009",
        "close": "38675605987009",
        "volume_pair": "5000000",
        "swap_count": 1
      }
    ],
    "truncated": false,
    "max_rows": 500
  },
  "5m": {
    "status": 200,
    "ms": 5,
    "candle_count": 13,
    "pool": "side",
    "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
    "sample": [
      {
        "bucket_start": "2026-08-18T04:35:00.000Z",
        "open": "36642378280851",
        "high": "38675605987009",
        "low": "36642378280851",
        "close": "38675605987009",
        "volume_pair": "6163129",
        "swap_count": 2
      },
      {
        "bucket_start": "2026-08-18T04:40:00.000Z",
        "open": "39063134988466",
        "high": "39063134988466",
        "low": "39063134988466",
        "close": "39063134988466",
        "volume_pair": "937952",
        "swap_count": 1
      }
    ],
    "truncated": false,
    "max_rows": 500
  },
  "1h": {
    "status": 200,
    "ms": 5,
    "candle_count": 7,
    "pool": "side",
    "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
    "sample": [
      {
        "bucket_start": "2026-08-18T04:00:00.000Z",
        "open": "36642378280851",
        "high": "39063134988466",
        "low": "36642378280851",
        "close": "39063134988466",
        "volume_pair": "7101081",
        "swap_count": 3
      },
      {
        "bucket_start": "2026-08-18T14:00:00.000Z",
        "open": "37011551089706",
        "high": "37624315542905",
        "low": "36193391155274",
        "close": "36193391155274",
        "volume_pair": "10057876",
        "swap_count": 3
      }
    ],
    "truncated": false,
    "max_rows": 500
  },
  "4h": {
    "status": 200,
    "ms": 5,
    "candle_count": 4,
    "pool": "side",
    "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
    "sample": [
      {
        "bucket_start": "2026-08-18T04:00:00.000Z",
        "open": "36642378280851",
        "high": "39063134988466",
        "low": "36642378280851",
        "close": "39063134988466",
        "volume_pair": "7101081",
        "swap_count": 3
      },
      {
        "bucket_start": "2026-08-18T12:00:00.000Z",
        "open": "37011551089706",
        "high": "37624315542905",
        "low": "36193391155274",
        "close": "36193391155274",
        "volume_pair": "10057876",
        "swap_count": 3
      }
    ],
    "truncated": false,
    "max_rows": 500
  },
  "1d": {
    "status": 200,
    "ms": 5,
    "candle_count": 3,
    "pool": "side",
    "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
    "sample": [
      {
        "bucket_start": "2026-08-18T00:00:00.000Z",
        "open": "36642378280851",
        "high": "39063134988466",
        "low": "36193391155274",
        "close": "36193391155274",
        "volume_pair": "17158957",
        "swap_count": 6
      },
      {
        "bucket_start": "2026-08-19T00:00:00.000Z",
        "open": "39036273998109",
        "high": "47576467803440",
        "low": "39036273998109",
        "close": "47576467803440",
        "volume_pair": "26602287",
        "swap_count": 4
      }
    ],
    "truncated": false,
    "max_rows": 500
  }
}
```

## GET /listings/:token/trades

```json
{
  "status": 200,
  "ms": 6,
  "body": {
    "token_address": "0x46639f9c43a688f185c83254564a6d743a27ce36",
    "items": [
      {
        "direction": "sell",
        "token_amount": "144199744585198746606321",
        "pair_amount": "5375888",
        "price_wad": "36334239867499",
        "tx_hash": "0xbe247f5b0808c5bfd71971a379c657f996fb9215ca6961ab157fb40ee938d8fd",
        "block_number": "41061474",
        "block_time": "2026-08-20T02:28:16.000Z",
        "pool": "side",
        "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
        "sender": "0x06afba43fd06227fa663b0daecf536f6eaa6bf99",
        "log_index": 1
      },
      {
        "direction": "sell",
        "token_amount": "288399489170397493212637",
        "pair_amount": "11768637",
        "price_wad": "38521216530345",
        "tx_hash": "0xf66e989e3db5577f94aad30730bbde809d58b76f19eb02d4c432721a4409a4be",
        "block_number": "41061309",
        "block_time": "2026-08-20T02:28:00.000Z",
        "pool": "side",
        "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
        "sender": "0x06afba43fd06227fa663b0daecf536f6eaa6bf99",
        "log_index": 0
      },
      {
        "direction": "buy",
        "token_amount": "239947710379367088922236",
        "pair_amount": "9957861",
        "price_wad": "43531930145355",
        "tx_hash": "0x4c0681d8db8f886f392f26e223bd38f75358a29e25fa49a0acb0f2599e0694c6",
        "block_number": "41061145",
        "block_time": "2026-08-20T02:27:43.000Z",
        "pool": "side",
        "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
        "sender": "0x545908ef28627547de3b2d26f2d7c9b46aa49c5f",
        "log_index": 43
      },
      {
        "direction": "sell",
        "token_amount": "239947710379367088922236",
        "pair_amount": "5100639143058320",
        "price_wad": "21203603018002113405520010306",
        "tx_hash": "0x4c0681d8db8f886f392f26e223bd38f75358a29e25fa49a0acb0f2599e0694c6",
        "block_number": "41061145",
        "block_time": "2026-08-20T02:27:43.000Z",
        "pool": "main",
        "pool_id": "0xb3b57975cfd5701ef9f3f2dfcc9153960eb79f8a739bb2ced0c74fd0f93147f4",
        "sender": "0x545908ef28627547de3b2d26f2d7c9b46aa49c5f",
        "log_index": 41
      },
      {
        "direction": "sell",
        "token_amount": "432599233755596239818956",
        "pair_amount": "18607803",
        "price_wad": "39286773720615",
        "tx_hash": "0xb0bf8a5b35998a695a8ce1861b57f55902868f3f8bb97a46327de82735876270",
        "block_number": "41061144",
        "block_time": "2026-08-20T02:27:43.000Z",
        "pool": "side",
        "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
        "sender": "0x06afba43fd06227fa663b0daecf536f6eaa6bf99",
        "log_index": 4
      }
    ],
    "amounts": "strings"
  }
}
```

## GET /wallets/:address/positions (deployer)

```json
{
  "status": 200,
  "ms": 1801,
  "body": {
    "wallet": "0x8f5077ec52543d6393f483dc2b958bf8cad2d232",
    "positions": [
      {
        "token_address": "0x46634229969b6d375bbb460ef3ebc97ccb4cb11b",
        "listing_address": "0x86d0a2fe8bb314ba936ee95e7c475772bbe9df78",
        "symbol": "MP",
        "balance": "85328145310513038559337",
        "cost_basis_usd": "0.00004041",
        "buy_tokens": "85328145310513038559337",
        "buy_notional_usd": "3.44796196",
        "matched_swaps": 2,
        "partial": false
      },
      {
        "token_address": "0x46635a7b299a680fe86ffed30cc91e53fb6315e4",
        "listing_address": "0xce1476acb40275bef4a90e08eb8b588f7af1f891",
        "symbol": "THOOK",
        "balance": "1489162300849242282353",
        "cost_basis_usd": "0.00003993",
        "buy_tokens": "57566397459398166325390",
        "buy_notional_usd": "2.29864131",
        "matched_swaps": 5,
        "partial": false
      }
    ],
    "amounts": "strings"
  }
}
```

## SSE /stream/prices

```json
{
  "events": [
    {
      "event": "snapshot",
      "data": {
        "prices": [
          {
            "type": "price",
            "token_address": "0x46634229969b6d375bbb460ef3ebc97ccb4cb11b",
            "listing_address": "0x86d0a2fe8bb314ba936ee95e7c475772bbe9df78",
            "symbol": "MP",
            "price_wad": "17397649194845494087147956393",
            "pool_id": "0xe827f269ecafeb1480cc05ab3b49715d10f9be645c8319ff9ae211b8dd9674ae",
            "pool": "main",
            "pair_currency": "eth",
            "liquidity": "12529412004665447202905",
            "block_number": "0",
            "block_time": "2026-08-20T18:37:37.000Z"
          },
          {
            "type": "price",
            "token_address": "0x46635a7b299a680fe86ffed30cc91e53fb6315e4",
            "listing_address": "0xce1476acb40275bef4a90e08eb8b588f7af1f891",
            "symbol": "THOOK",
            "price_wad": "0",
            "pool_id": "0xdc78d3c81113125b71ebd823866efa3aa44f22d59ce0b100b4c7fea8438f83da",
            "pool": "side",
            "pair_currency": "usdg",
            "liquidity": "0",
            "block_number": "0",
            "block_time": "2026-08-20T18:33:33.000Z"
          },
          {
            "type": "price",
            "token_address": "0x46639f9c43a688f185c83254564a6d743a27ce36",
            "listing_address": "0xc85eca7573717e9094f11eeecea960011e4c9e07",
            "symbol": "MOONER",
            "price_wad": "36334239867499",
            "pool_id": "0xad95ba283f2b3bca327525244d7fc5d8021f1057b58a59a3ed95077474970dbb",
            "pool": "side",
            "pair_currency": "usdg",
            "liquidity": "30073674456279135",
            "block_number": "0",
            "block_time": "2026-08-20T02:28:16.000Z"
          }
        ],
        "amounts": "strings"
      }
    },
    {
      "event": "price",
      "data": {
        "type": "price",
        "token_address": "0x46639f9c43a688f185c83254564a6d743a27ce36",
        "listing_address": "0xc85eca7573717e9094f11eeecea960011e4c9e07",
        "symbol": "MOONER",
        "price_wad": "21199363306802188825781682003",
        "pool_id": "0xb3b57975cfd5701ef9f3f2dfcc9153960eb79f8a739bb2ced0c74fd0f93147f4",
        "pool": "main",
        "pair_currency": "eth",
        "liquidity": "13833233077531051342885",
        "block_number": "99999999",
        "block_time": "2026-08-20T20:00:46.284Z"
      }
    }
  ],
  "simulated_swap_id": "49",
  "pass": true,
  "got_snapshot": true,
  "got_price": true,
  "price_payload": {
    "type": "price",
    "token_address": "0x46639f9c43a688f185c83254564a6d743a27ce36",
    "listing_address": "0xc85eca7573717e9094f11eeecea960011e4c9e07",
    "symbol": "MOONER",
    "price_wad": "21199363306802188825781682003",
    "pool_id": "0xb3b57975cfd5701ef9f3f2dfcc9153960eb79f8a739bb2ced0c74fd0f93147f4",
    "pool": "main",
    "pair_currency": "eth",
    "liquidity": "13833233077531051342885",
    "block_number": "99999999",
    "block_time": "2026-08-20T20:00:46.284Z"
  }
}
```

## Notes

- Amounts are JSON strings throughout.
- Public endpoints filter generations.visible = true.
- /health includes all generations (hidden + visible).
- Candles capped at CANDLES_MAX_ROWS (default 500).
- SSE: shared LISTEN stonkz_swaps + poll; heartbeat ~15s; reconnect with backoff and re-GET /listings.
