hapi-bookshelf-jsonapi
======================

Uses Bookshelf models to produce JSON API server routes on a Hapi server.

## Installation

```
npm install hapi-bookshelf-jsonapi --save
```

You should also install [`hapi-json-api`][1] & [`hapi-bookshelf-models`][4] to get functionality it provides:

```
npm install @gar/hapi-json-api hapi-bookshelf-models --save
```

## Setup

Now we need to register these plugins:

```javascript
server.register([
  { register: require('hapi-bookshelf-models') },
  { register: require('@gar/hapi-json-api') },
  {
    register: require('hapi-bookshelf-jsonapi').register,
    options: {
      resources: {
        'author': {
          model: 'Author',          // Model name in registry
          basePath: '/authors',
          specialColumns: {          // Optional info about special columns
            updated: 'updated_at',  // Column set to NOW() on PATCH etc.
            meta: ['created_at', 'updated_at'], // Columns included in "meta"
                                                // instead of "attributes"
            hidden: ['password'],
          },
          relationships: {
            hasOne: {
              publisher: {
                type: 'company',
                column: 'publisher_id',
                readonly: true,     // Do not allow PATCH etc.
              },
            },
            hasMany: {
              books: {
                type: 'book',
              },
            },
          },
        },
      },
    },
  },
], function (err) {
  if (err) throw err;
});
```

Unfortunately, [Bookshelf.js][2] does not make it easy to inspect a Model and
get information about its relationships, so we need to re-declare them in the
`hapi-bookshelf-jsonapi` configuration. To avoid having your relationships
declared in separate files, we could do:

```javascript
relationships: server.plugins.bookshelf.model('Author').relationships,
```

And then declare `relationships` as a static model attribute:

```javascript
return baseModel.extend({
  tableName: 'authors',
  // bookshelf relationships
}, {
  relationships: {
    hasOne: { /* jsonapi relationships */ },
    hasMany: { /* jsonapi relationships */ },
  },
});
```

## Error Handling

The `@gar/hapi-json-api` plugin will handle converting [Boom][3] errors and
uncaught exceptions into the expected JSON API format. However, to convert
things like database uniqueness errors into the appropriate `409 Conflict`, we
need to intercept them before they get to `@gar/hapi-json-api`:

```javascript
server.ext({
  type: 'onPreResponse',
  options: {
    before: '@gar/hapi-json-api',
  },
  method: function (request, reply) {
    const response = request.response;
    if (response.isBoom) {
      const err = response;
      // The following logic is specific to PostgreSQL databases!
      if (err.code === '23505') {
        const newErr = Boom.create(409, err.message);
        Object.assign(response.output, newErr.output);
      } else if (err.code && err.code.match(/^2[23]/)) {
        const newErr = Boom.create(400, err.message);
        Object.assign(response.output, newErr.output);
      } else if (response.output.statusCode === 500) {
        console.error(err);
      }
    }
    reply.continue();
  },
});
```

## Authorization

Sometimes you won't want to give all authenticated user's access to all JSON
API resources. You can use Hapi's `onPreHandler` extension point, in
conjunction with some information exposed in the route configuration, to add
your own logic:

```javascript
server.ext('onPreHandler', function (request, reply) {
  try {
    const creds = request.auth.credentials;
    const route = request.route.settings.plugins['hapi-bookshelf-jsonapi'];
    console.log(route);   // To see everything that's available.
    if (creds.role !== 'admin') {
      if (route.action !== 'fetch' && route.action !== 'index') {
        throw Boom.forbidden();
      }
    }
  } catch (err) {
    if (err.isBoom) return reply(err);
  }
  return reply.continue();
});
```

[1]: https://github.com/wraithgar/hapi-json-api
[2]: http://bookshelfjs.org/
[3]: https://github.com/hapijs/boom
[4]: https://github.com/lob/hapi-bookshelf-models
