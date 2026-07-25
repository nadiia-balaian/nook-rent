alter table nook.listings
  add column base_deposit_atomic numeric(78, 0) not null
  check (base_deposit_atomic > 0);
