'use strict';

const http = require('http');
const mysqlx = require('@mysql/xdevapi');

const port = process.env.PORT || 9999;
const statusOk = 200;
// const statusNoContent = 204;
const statusBadRequest = 400;
const statusNotFound = 404;
const statusInternalServerError = 500;
const schema = 'social';

const client = mysqlx.getClient({
  user: 'app',
  password: 'pass',
  host: 'localhost',
  port: 33060
});

function sendResponse(response, { status = statusOk, headers = {}, body = null }) {
  Object.entries(headers).forEach(function ([key, value]) {
    response.setHeader(key, value);
  });
  response.writeHead(status);
  response.end(body);
}

function sendJSON(response, body) {
  sendResponse(response, {
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function map(columns) {
  return row => row.reduce((res, value, i) => ({ ...res, [columns[i].getColumnLabel()]: value }), {});
}

const methods = new Map();

methods.set('/posts.get', async ({ response, db }) => {
  const table = await db.getTable('posts');
  const result = await table.select(['id', 'content', 'likes', 'created'])
    .where('removed = :removed')
    .bind('removed', false)
    .orderBy('id DESC')
    .execute();

  const data = result.fetchAll();
  result.getAffectedItemsCount();
  const columns = result.getColumns();
  const posts = data.map(map(columns));
  sendJSON(response, posts);
});

methods.set('/posts.getById', async ({ response, searchParams, db }) => {
  if (!searchParams.has('id')) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  const id = Number(searchParams.get('id'));
  if (Number.isNaN(id)) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }


  const table = await db.getTable('posts');
  const result = await table.select(['id', 'content', 'likes', 'created'])
    .where('removed =:removed')
    .bind('removed', false)
    .orderBy('id DESC')
    .execute();
  const data = result.fetchAll();
  result.getAffectedItemsCount();
  const columns = result.getColumns();
  const posts = data.map(map(columns));
  const post = posts.filter(o => !o.removed).find(o => o.id === id);
  if (post === undefined) {
    sendResponse(response, { status: statusNotFound });
    return;
  }
  sendJSON(response, post);
});

methods.set('/posts.post', async ({ response, searchParams, db }) => {
  if (!searchParams.has('content')) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  const content = searchParams.get('content');

  const table = await db.getTable('posts');
  await table.insert('content')
    .values(content)
    .execute();

  const result = await table.select(['id', 'content', 'likes', 'created'])
    .where('removed = :removed')
    .bind('removed', false)
    .orderBy('id DESC')
    .execute();
  const data = result.fetchAll();
  result.getAffectedItemsCount();
  const columns = result.getColumns();
  const posts = data.map(map(columns));
  sendJSON(response, posts[0]);
});

methods.set('/posts.edit', async ({ response, searchParams, db }) => {
  if (!searchParams.has('id')) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  const id = Number(searchParams.get('id'));
  if (Number.isNaN(id)) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  if (!searchParams.has('content')) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }
  const content = searchParams.get('content');
  const table = await db.getTable('posts');
  let result = await table.update()
    .set('content', content)
    .where('removed = :removed && id = :id')
    .bind('id', id)
    .bind('removed', false)
    .execute();

  result = await table.select(['id', 'content', 'likes', 'created'])
    .where('removed = :removed')
    .bind('removed', false)
    .orderBy('id DESC')
    .execute();


  result.getAffectedItemsCount();
  const columns = result.getColumns();
  const data = result.fetchAll();
  const posts = data.map(map(columns));

  const post = posts.filter(o => !o.removed).find(o => o.id === id);
  if (post === undefined) {
    sendResponse(response, { status: statusNotFound });
    return;
  }

  post.content = content;

  sendJSON(response, post);
});

methods.set('/posts.delete', async ({ response, searchParams, db }) => {
  if (!searchParams.has('id')) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  const id = Number(searchParams.get('id'));
  if (Number.isNaN(id)) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  const table = await db.getTable('posts');
  let result = await table.select(['id', 'content', 'removed', 'likes', 'created'])
    .where('removed = :removed')
    .bind('removed', false)
    .execute();


  result.getAffectedItemsCount();
  const columns = result.getColumns();
  const data = result.fetchAll();
  const posts = data.map(map(columns));

  const post = posts.find(o => o.id === id);

  if (post === undefined) {
    sendResponse(response, { status: statusNotFound });
    return;
  }

  if (post.removed) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  post.removed = 1;

  result = await table.update()
    .set('removed', true)
    .where('id = :id && removed = :removed')
    .bind('removed', false)
    .bind('id', id)
    .execute();

  sendJSON(response, post);
});

methods.set('/posts.restore', async ({ response, searchParams, db }) => {
  if (!searchParams.has('id')) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }

  const id = Number(searchParams.get('id'));
  if (Number.isNaN(id)) {
    sendResponse(response, { status: statusBadRequest });
    return;
  }
  const table = await db.getTable('posts');
  let result = await table.select(['id', 'content', 'removed', 'likes', 'created'])
    .where('removed = :removed')
    .bind('removed', true)
    .execute();


  result.getAffectedItemsCount();
  const columns = result.getColumns();
  const data = result.fetchAll();
  const posts = data.map(map(columns));

  const post = posts.find(o => o.id === id);

  if (post === undefined) {
    sendResponse(response, { status: statusNotFound });
    return;
  }

  post.removed = 0;

  result = await table.update()
    .set('removed', false)
    .where('id = :id')
    .bind('id', id)
    .execute();

  sendJSON(response, post);
});

methods.set('/posts.like', async ({response, searchParams, db}) => {
    const id = Number(searchParams.get('id'));

    if (!searchParams.has('id') || Number.isNaN(id)) {
        sendResponse(response, {status: statusBadRequest});
        return;
    }

    const table = await db.getTable('posts');
    const getLikes = await table.select(['id', 'content', 'likes', 'created'])
        .where('id = :id && removed = 0')
        .bind('id', id)
        .execute();
    
    const dataL = getLikes.fetchAll();
    if (dataL.length === 0) {
        sendResponse(response, {status: statusNotFound});
        return;
    }
    getLikes.getAffectedItemsCount();
    const columnsL = getLikes.getColumns();
    let postL = dataL.map(map(columnsL));
    postL = postL[0];

    const result = await table.update()
        .set('likes', postL.likes + 1)
        .where('id = :id && removed = 0')
        .bind('id', id)
        .execute();
    
    const liked = result.getAffectedItemsCount();
    if (liked === 0) {
        sendResponse(response, {status: statusNotFound});
        return;
    }

    const likedResult = await table.select(['id', 'content', 'likes', 'created'])
    .where('id = :id')
    .bind('id', id)
    .execute();

    const data = likedResult.fetchAll();
    likedResult.getAffectedItemsCount();
    const columns = likedResult.getColumns();
    let post = data.map(map(columns));
    post = post[0];
    if (post === undefined) {
        sendResponse(response, {status: statusNotFound});
        return;
    }
    sendJSON(response, post);
});

methods.set('/posts.dislike', async ({response, searchParams, db}) => {
    const id = Number(searchParams.get('id'));

    if (!searchParams.has('id') || Number.isNaN(id)) {
        sendResponse(response, {status: statusBadRequest});
        return;
    }

    const table = await db.getTable('posts');
    const getLikes = await table.select(['id', 'content', 'likes', 'created'])
        .where('id = :id && removed = 0')
        .bind('id', id)
        .execute();
    
    const dataL = getLikes.fetchAll();
    if (dataL.length === 0) {
        sendResponse(response, {status: statusNotFound});
        return;
    }
    getLikes.getAffectedItemsCount();
    const columnsL = getLikes.getColumns();
    let postL = dataL.map(map(columnsL));
    postL = postL[0];

    const result = await table.update()
        .set('likes', postL.likes - 1)
        .where('id = :id && removed = 0')
        .bind('id', id)
        .execute();
    
    const liked = result.getAffectedItemsCount();
    if (liked === 0) {
        sendResponse(response, {status: statusNotFound});
        return;
    }

    const likedResult = await table.select(['id', 'content', 'likes', 'created'])
    .where('id = :id')
    .bind('id', id)
    .execute();

    const data = likedResult.fetchAll();
    likedResult.getAffectedItemsCount();
    const columns = likedResult.getColumns();
    let post = data.map(map(columns));
    post = post[0];
    if (post === undefined) {
        sendResponse(response, {status: statusNotFound});
        return;
    }
    sendJSON(response, post);
});

const server = http.createServer(async (request, response) => {
  const { pathname, searchParams } = new URL(request.url, `http://${request.headers.host}`);

  const method = methods.get(pathname);
  if (method === undefined) {
    sendResponse(response, { status: statusNotFound });
    return;
  }

  let session = null;
  try {
    session = await client.getSession();
    const db = await session.getSchema(schema);

    const params = {
      request,
      response,
      pathname,
      searchParams,
      db,
    };

    await method(params);
  } catch (e) {
    sendResponse(response, { status: statusInternalServerError });
  } finally {
    if (session !== null) {
      try {
        await session.close();
      } catch (e) {
        console.log(e);
      }
    }
  }
});

server.listen(port);
