create or replace function nook.expire_pending_booking_with_hold()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, nook, pg_temp
as $$
begin
  update nook.booking_requests
  set
    status = 'expired',
    updated_at = new.updated_at
  where hold_id = new.id
    and status = 'pending';

  update nook.bookings
  set
    status = 'expired',
    updated_at = new.updated_at
  where hold_id = new.id
    and status in ('request_received', 'approval_pending', 'awaiting_deposit');

  return new;
end;
$$;

drop trigger if exists expire_pending_booking_with_hold on nook.reservation_holds;

create trigger expire_pending_booking_with_hold
after update of status on nook.reservation_holds
for each row
when (old.status = 'active' and new.status = 'expired')
execute function nook.expire_pending_booking_with_hold();

update nook.reservation_holds
set
  status = 'expired',
  updated_at = now()
where status = 'active'
  and expires_at <= now();

update nook.booking_requests as request
set
  status = 'expired',
  updated_at = greatest(request.updated_at, hold.updated_at)
from nook.reservation_holds as hold
where request.hold_id = hold.id
  and hold.status = 'expired'
  and request.status = 'pending';

update nook.bookings as booking
set
  status = 'expired',
  updated_at = greatest(booking.updated_at, hold.updated_at)
from nook.reservation_holds as hold
where booking.hold_id = hold.id
  and hold.status = 'expired'
  and booking.status in ('request_received', 'approval_pending', 'awaiting_deposit');

revoke all on function nook.expire_pending_booking_with_hold() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function nook.expire_pending_booking_with_hold() to service_role';
  end if;
end;
$$;
