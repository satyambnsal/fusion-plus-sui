module silver_v3::permit_token;

use sui::coin::{Self, Coin, TreasuryCap};
use sui::transfer;
use sui::object::{Self, UID};
use sui::ed25519;
use sui::hash;
use std::vector;


public struct PERMIT_TOKEN has drop {}

public struct Permit has store, drop {
        owner: address,
        spender: address,
        amount: u64,
        nonce: u64,
        deadline: u64,
    }

public struct NonceRegistry has key {
    id: UID,
    used_nonces: vector<u64>,
}

    // Errors
    const EInvalidSignature: u64 = 1;
    const EPermitExpired: u64 = 2;
    const EInsufficientBalance: u64 = 3;
    const ENonceUsed: u64 = 4;

    // Token struct

    // Initialize token
fun init(witness: PERMIT_TOKEN, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        8, // decimals
        b"PTK",
        b"Permit Token",
        b"Token with permit functionality",
        option::none(),
        ctx
    );
    
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, tx_context::sender(ctx));
    
    // Create nonce registry
    let registry = NonceRegistry {
        id: object::new(ctx),
        used_nonces: vector::empty(),
    };
    transfer::share_object(registry);
}

// Mint tokens
public entry fun mint(
    treasury: &mut TreasuryCap<PERMIT_TOKEN>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let token = coin::mint(treasury, amount, ctx);
    transfer::public_transfer(token, recipient);
}

// Standard transfer
public entry fun transfer(
    token: &mut Coin<PERMIT_TOKEN>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let split_coin = coin::split(token, amount, ctx);
    transfer::public_transfer(split_coin, recipient);
}

// Transfer with permit (signature-based approval)
public entry fun transfer_with_permit(
    token: &mut Coin<PERMIT_TOKEN>,
    registry: &mut NonceRegistry,
    owner: address,
    spender: address,
    amount: u64,
    nonce: u64,
    deadline: u64,
    signature: vector<u8>,
    public_key: vector<u8>,
    ctx: &mut TxContext
) {
    // Check if permit is expired
    assert!(tx_context::epoch(ctx) <= deadline, EPermitExpired);
    
    // Check if nonce is already used
    assert!(!vector::contains(&registry.used_nonces, &nonce), ENonceUsed);
    
    // Verify signature
    let permit = Permit {
        owner,
        spender,
        amount,
        nonce,
        deadline,
    };
    
    let message = create_permit_message(permit);
    assert!(
        ed25519::ed25519_verify(&signature, &public_key, &message),
        EInvalidSignature
    );
    
    // Check token ownership (the coin should belong to the owner)
    assert!(coin::value(token) >= amount, EInsufficientBalance);
    
    // Mark nonce as used
    vector::push_back(&mut registry.used_nonces, nonce);
    
    // Transfer tokens
    let split_coin = coin::split(token, amount, ctx);
    transfer::public_transfer(split_coin, spender);
}

// Helper function to create permit message for signing
fun create_permit_message(permit: Permit): vector<u8> {
    let mut message = vector::empty<u8>();
    
    // Append permit fields to message
    vector::append(&mut message, sui::address::to_bytes(permit.owner));
    vector::append(&mut message, sui::address::to_bytes(permit.spender));
    vector::append(&mut message, sui::bcs::to_bytes(&permit.amount));
    vector::append(&mut message, sui::bcs::to_bytes(&permit.nonce));
    vector::append(&mut message, sui::bcs::to_bytes(&permit.deadline));
    
    // Hash the message
    std::hash::sha3_256(message)
}

// Get permit hash for off-chain signing
public fun get_permit_hash(
    owner: address,
    spender: address,
    amount: u64,
    nonce: u64,
    deadline: u64,
): vector<u8> {
    let permit = Permit {
        owner,
        spender,
        amount,
        nonce,
        deadline,
    };
    create_permit_message(permit)
}

// Check if nonce is used
public fun is_nonce_used(registry: &NonceRegistry, nonce: u64): bool {
    vector::contains(&registry.used_nonces, &nonce)
}

// Burn tokens
public entry fun burn(
    treasury: &mut TreasuryCap<PERMIT_TOKEN>,
    token: Coin<PERMIT_TOKEN>
) {
    coin::burn(treasury, token);
}
