module swap_contract::swap_v3 {
    use sui::coin::{Self, Coin};
    use sui::balance::{Balance};
    use sui::clock::{Self, Clock};
    use sui::hash;
    use sui::event;


    const EINVALID_AMOUNT: u64 = 3;
    const EORDER_ALREADY_FILLED_OR_CANCELLED: u64 = 5;
    const EORDER_EXPIRED: u64 = 6;
    const EORDER_NOT_EXPIRED: u64 = 7;
    const EINVALID_SECRET: u64 = 11;
    const EINVALID_SECRET_HASH: u64 = 15;

    public struct Order<phantom T> has key, store {
        id: UID,
        maker: address,
        amount: u64,
        min_amount: u64,
        expiration_timestamp_ms: u64,
        secret_hash: vector<u8>,
        resolver: Option<address>,
        revealed_secret: Option<vector<u8>>,
        coins: Option<Balance<T>>,
    }

    public struct SwapRegistry has key {
        id: UID,
        order_counter: u64,
    }

    public struct OrderAnnounced has copy, drop {
        order_id: ID,
        maker: address,
        amount: u64,
        min_amount: u64,
        expiration_timestamp_ms: u64,
        secret_hash: vector<u8>,
    }

    public struct OrderFunded has copy, drop {
        order_id: ID,
        resolver: address,
        amount: u64,
        expiration_timestamp_ms: u64,
        secret_hash: vector<u8>,
    }

    public struct OrderClaimed has copy, drop {
        order_id: ID,
        maker: address,
        resolver: address,
        secret: vector<u8>,
    }

    public struct OrderCancelled has copy, drop {
        order_id: ID,
        maker: address,
    }

    fun init(ctx: &mut TxContext) {
        let registry = SwapRegistry {
            id: object::new(ctx),
            order_counter: 0,
        };
        transfer::share_object(registry);
    }

    public entry fun announce_order<T>(
        registry: &mut SwapRegistry,
        payment: Coin<T>,
        min_dst_amount: u64,
        expiration_duration_ms: u64,
        secret_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EINVALID_AMOUNT);
        assert!(min_dst_amount > 0, EINVALID_AMOUNT);
        assert!(vector::length(&secret_hash) == 32, EINVALID_SECRET_HASH);
        
        let maker = tx_context::sender(ctx);
        let expiration_timestamp = clock::timestamp_ms(clock) + expiration_duration_ms;
        
        let order_id = object::new(ctx);
        let order_id_copy = object::uid_to_inner(&order_id);
        
        let order = Order<T> {
            id: order_id,
            maker,
            amount,
            min_amount: min_dst_amount,
            expiration_timestamp_ms: expiration_timestamp,
            secret_hash,
            resolver: option::none(),
            revealed_secret: option::none(),
            coins: option::some(coin::into_balance(payment)),
        };
        
        event::emit(OrderAnnounced {
            order_id: order_id_copy,
            maker,
            amount,
            min_amount: min_dst_amount,
            expiration_timestamp_ms: expiration_timestamp,
            secret_hash,
        });
        
        transfer::share_object(order);
        
        registry.order_counter = registry.order_counter + 1;
    }

    public entry fun fund_dst_escrow<T>(
        registry: &mut SwapRegistry,
        maker: address,
        payment: Coin<T>,
        expiration_duration_ms: u64,
        secret_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EINVALID_AMOUNT);
        assert!(vector::length(&secret_hash) == 32, EINVALID_SECRET_HASH);
        
        let resolver = tx_context::sender(ctx);
        let expiration_timestamp = clock::timestamp_ms(clock) + expiration_duration_ms;
        
        let order_id = object::new(ctx);
        let order_id_copy = object::uid_to_inner(&order_id);
        
        let order = Order<T> {
            id: order_id,
            maker,
            amount,
            min_amount: 0,
            expiration_timestamp_ms: expiration_timestamp,
            secret_hash,
            resolver: option::some(resolver),
            revealed_secret: option::none(),
            coins: option::some(coin::into_balance(payment)),
        };
        
        event::emit(OrderFunded {
            order_id: order_id_copy,
            resolver,
            amount,
            expiration_timestamp_ms: expiration_timestamp,
            secret_hash,
        });
        

        transfer::share_object(order);
        
        registry.order_counter = registry.order_counter + 1;
    }


    public entry fun claim_funds<T>(
        order: &mut Order<T>,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(clock::timestamp_ms(clock) < order.expiration_timestamp_ms, EORDER_EXPIRED);


        assert!(option::is_none(&order.revealed_secret), EORDER_ALREADY_FILLED_OR_CANCELLED);

        // Verify secret hash using Keccak256
        let computed_hash = hash::keccak256(&secret);
        assert!(computed_hash == order.secret_hash, EINVALID_SECRET);

        assert!(option::is_some(&order.coins), EORDER_ALREADY_FILLED_OR_CANCELLED);

        let resolver = tx_context::sender(ctx);
        let maker = order.maker;
        let order_id = object::uid_to_inner(&order.id);

        order.revealed_secret = option::some(secret);

        let balance = option::extract(&mut order.coins);
        let coins = coin::from_balance(balance, ctx);
        transfer::public_transfer(coins, maker);

        event::emit(OrderClaimed {
            order_id,
            resolver,
            maker,
            secret,
        });
    }
    
    public entry fun cancel_swap<T>(
        order: &mut Order<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let caller = tx_context::sender(ctx);
        
        let can_cancel = (caller == order.maker) || 
                        (clock::timestamp_ms(clock) >= order.expiration_timestamp_ms);
        assert!(can_cancel, EORDER_NOT_EXPIRED);
        assert!(option::is_none(&order.revealed_secret), EORDER_ALREADY_FILLED_OR_CANCELLED);
        assert!(option::is_some(&order.coins), EORDER_ALREADY_FILLED_OR_CANCELLED);
        let order_id = object::uid_to_inner(&order.id);
        order.revealed_secret = option::some(vector::singleton(0u8));
        let balance = option::extract(&mut order.coins);
        let coins = coin::from_balance(balance, ctx);
        
        let recipient = if (order.maker != @0x0) {
            order.maker
        } else {
            *option::borrow(&order.resolver)
        };
        
        transfer::public_transfer(coins, recipient);

        event::emit(OrderCancelled {
            order_id,
            maker: caller,
        });
    }
    public fun is_order_completed<T>(order: &Order<T>): bool {
        option::is_some(&order.revealed_secret)
    }

    public fun get_revealed_secret<T>(order: &Order<T>): vector<u8> {
        if (option::is_some(&order.revealed_secret)) {
            *option::borrow(&order.revealed_secret)
        } else {
            vector::empty()
        }
    }

    public fun get_order_details<T>(order: &Order<T>): (
        address,
        u64,
        u64,
        u64,
        vector<u8>,
        bool,
        address,
        bool,
        bool
    ) {
        let resolver_addr = if (option::is_some(&order.resolver)) {
            *option::borrow(&order.resolver)
        } else {
            @0x0
        };
        (
            order.maker,
            order.amount,
            order.min_amount,
            order.expiration_timestamp_ms,
            order.secret_hash,
            option::is_some(&order.resolver),
            resolver_addr,
            option::is_some(&order.revealed_secret),
            option::is_some(&order.coins)
        )
    }

    public fun get_order_id<T>(order: &Order<T>): ID {
        object::uid_to_inner(&order.id)
    }

    public fun get_order_counter(registry: &SwapRegistry): u64 {
        registry.order_counter
    }
}
