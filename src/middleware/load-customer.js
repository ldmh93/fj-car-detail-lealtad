'use strict';

const customers = require('../services/customers');
const loyalty = require('../services/loyalty');

/** router.param('id', loadCustomer): carga el cliente y su tarjeta en req.target / req.card. */
async function loadCustomer(req, res, next, id) {
  const customer = /^\d{1,12}$/.test(id) ? await customers.findById(Number(id)) : null;
  if (!customer) {
    return res.status(404).render('error', {
      title: 'Cliente no encontrado',
      message: 'No encontramos a este cliente. Búscalo de nuevo en la lista.',
      back: '/panel/clientes',
    });
  }
  req.target = customer;
  req.card = await loyalty.getCard(customer.id);
  res.locals.target = customer;
  res.locals.card = req.card;
  next();
}

module.exports = loadCustomer;
