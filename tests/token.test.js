
import faunadb, { query as q } from 'faunadb'
import randomize from 'randomatic'


const createClient = (secret) => {
  return new faunadb.Client({
    secret: secret,
    scheme: 'http',
    domain: 'localhost',
    port: 8443
  })
}


const rootSecret = 'secret'

const adminClient = createClient(rootSecret)

let client
let user1Client

beforeAll(async () => {
  const dbName = randomize('a-z', 12)
  const res = await adminClient.query(
    q.Do(
      q.CreateDatabase({ name: dbName }),
      q.CreateKey({ database: q.Database(dbName), role: 'server' })
    )
  )

  client = createClient(res.secret)

  const initData = await client.query(q.Let(
    {
      users: q.CreateClass({ name: 'users' }),
    },
    {
      posts: q.CreateClass({
        name: 'posts',
        permissions: {
          read: q.Select(['ref'], q.Var('users')),
        }
      }),
      tokens: q.Let(
        {
          user1: q.Create(q.Select(['ref'], q.Var('users')), { data: { name: 'User 1' } }),
        },
        {
          token1: q.Create(q.Ref('tokens'), { instance: q.Select(['ref'], q.Var('user1')) }),
        }
      ),
    }
  )).catch(err => err)

  user1Client = createClient(initData.tokens.token1.secret)
})

afterAll(async () => {
  // return adminClient.query(
  //   q.Delete(db.database)
  // )
})


describe('token secret', () => {
  it('should fail when user 1 tries to create a post', async () => {
    const post = await user1Client.query(
      q.Create(q.Class('posts'), { data: { title: 'One ' } })
    ).catch(e => e)
    expect(post.name).toEqual('PermissionDenied')
  })

  it('should work for user 1 to read post', async () => {
    const post = await client.query(
      q.Create(q.Class('posts'), { data: { foo: 'bar' } })
    )
    expect(post.data.foo).toEqual('bar')
    const res = await user1Client.query(
      q.Get(post.ref)
    )
    expect(res.data.foo).toEqual('bar')
  })

  it('should not work for user 1 to crate a new user', async () => {
    const res = await user1Client.query(
      q.Create(q.Class('users'), { data: { name: 'A new user' } })
    ).catch(e => e)
    expect(res.name).toEqual('PermissionDenied')
  })
})



