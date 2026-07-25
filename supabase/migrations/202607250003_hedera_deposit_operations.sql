create unique index operations_one_hedera_deposit_per_booking_idx
  on nook.operations (aggregate_id)
  where operation_kind = 'hedera_deposit'
    and aggregate_type = 'booking'
    and provider = 'hedera';
