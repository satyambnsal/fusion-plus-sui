# Cross chain swap between Sui and Base chain using Fusion Plus API





# CLI Commands

1. Mint Silver coin to wallet address
```
sui client call --function mint --module silver --package 0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5 --args 0x4dfb330cf192396e03f988df495eb567de8f5176c080a9b8472813436ca2829c 100000000000000 0x45abe1b325d24ee32f0318fd8706b757db4e22f89fa5ba53203e7da0f2d10eb1
```

Mint silverv3
```
```
sui client call --function mint --module permit_token --package 0x3764580c8b26786003f01c0c8f30d826872324d1bce129d7f40e183cbc20d4df --args 0x65b56596ea02f0117d73bbcebf7f71919fb9e884ea8ac6d169456bf6f6a37703 200000000000000 0x10e4f1e870282b3cb1927e2e7e3cf23c60c345c4df4dcd32336ef0f67d0910df
```
```


# Deployed Contracts


1. Silver coin on Sui Testnet
package Id
0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5

Treasury cap object
0x4dfb330cf192396e03f988df495eb567de8f5176c080a9b8472813436ca2829c

Coin Address: 0x2::coin::Coin<0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5


**Swap Contract**
Package ID: 0x275626d26726ad0d4bddc89c29120a97411207223d01a549438092d003ecc8bb
Swap Registry: 0xdf92792583d16d20b05d720c7f5da65adcdb8f7ef5b084a6295e1d799345b9d1

# Open Questions

- [] Deploy Senku Coin




# Prompts

, once relayer creates source and destination escrow, relayer responds to relayer that both escrow filled. 
now relayer will reveal the secret for resepective order
and the resolver will first claim funds for user on destination chain and then will claim funds for himself on the source chain

For sui to eth flow, eth resolver should be able to withdraw funds.



- [] Get signature on Sui for fund transfer

