import { leanApiFetch } from './leanApi.js';
import { db } from './db.js';

// Falcon's own collection account — where every customer's top-up lands.
// Destinations are scoped per Lean customer (customer_id in the create
// call): a destination created without one is APPLICATION-owned instead of
// belonging to the paying customer, which silently breaks Open Finance
// payments against it. Because destinations can't be edited, a fresh,
// correctly-scoped one is created per customer instead of reusing a shared
// APPLICATION-owned one.
const FALCON_DESTINATION = {
  name: 'Falcon Exchange LLC',
  display_name: 'Falcon Exchange',
  address: 'Sheikh Zayed Road, Business Bay',
  city: 'Dubai',
  country: 'ARE',
  account_number: '1015000000777',
  iban: 'AE760260001015000000777',
  swift_code: 'EBILAEADXXX',
  bank_type: 'SME',
  government_identifier: { type: 'TRADE_LICENSE_NUMBER', value: 'CN-FALCON-0001' },
};

export async function ensureLeanCustomer(user) {
  if (user.leanCustomerId) return user.leanCustomerId;
  const customer = await leanApiFetch('/customers/v1/', {
    method: 'POST',
    body: JSON.stringify({ app_user_id: user.id }),
  });
  db.users.update(user.id, { leanCustomerId: customer.customer_id });
  return customer.customer_id;
}

export async function ensureFalconDestination(user, customerId) {
  if (user.falconDestinationId) return user.falconDestinationId;
  const destination = await leanApiFetch('/payments/v1/destinations', {
    method: 'POST',
    body: JSON.stringify({ ...FALCON_DESTINATION, customer_id: customerId }),
  });
  const destinationId = destination.payment_destination_id ?? destination.id;
  db.users.update(user.id, { falconDestinationId: destinationId });
  return destinationId;
}
