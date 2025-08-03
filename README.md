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

# Sui Configuration
SWAP_CONTRACT_SUI_PACKAGE_ID=0x542196e996a3504bcfdc8b837d5af40c989c15dc2514357689bc76e619ef9a39
SWAP_CONTRACT_SUI_REGISTRY_OBJECT_ID=0xb0ae81570a901034d3c407dfa3ecb71b6d57b6703534fe0585e8376d044a497e
SILVER_COIN_ADDRESS="0xe33c8ada01d0c54b83546a768bf35b9af658502b59fa03c20793f832a91098d5::silver::SILVER"


# Open Questions

- [] Deploy Senku Coin



