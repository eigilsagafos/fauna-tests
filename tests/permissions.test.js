
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

  const body = q.Query((roles, userRef) => (
    q.Map(roles, roleRef => (
      q.Update(roleRef, {
        delegates: q.Prepend(
          q.Filter(
            q.Select(['delegates'], q.Get(roleRef), []),
            q.Lambda('r', q.And(
              q.Exists(q.Var('r')), // Remove if ref is no longer valid. TODO: Should not be necessary?
              q.Not(q.Equals(q.Var('r'), userRef)), // Remove if user already exists
            )),
          ),
          [userRef],
        ),
      })
    ))
  ))

  const res2 = await client.query(q.Let(
    {
      users: q.CreateClass({ name: 'users' }),
      roles: q.CreateClass({ name: 'roles' }),
      permissionsFunction: q.CreateFunction({ name: 'add_permissions', body }),
      role_create_posts: q.CreateClass({ name: 'role_create_posts' }),
      role_write_posts: q.CreateClass({ name: 'role_write_posts' }),
      role_read_posts: q.CreateClass({ name: 'role_read_posts' }),
    },
    {
      users: q.CreateClass({
        name: 'posts',
        permissions: {
          create: q.Select(['ref'], q.Var('role_create_posts')),
          write: q.Select(['ref'], q.Var('role_write_posts')),
          read: q.Select(['ref'], q.Var('role_read_posts')),
        }
      }),
      roles: {
        role1: q.Create(q.Ref(q.Select(['ref'], q.Var('roles')), 1)),
        role2: q.Create(q.Ref(q.Select(['ref'], q.Var('roles')), 2)),
        role3: q.Create(q.Ref(q.Select(['ref'], q.Var('roles')), 3)),
      },
      tokens: q.Let(
        {
          user1: q.Create(q.Select(['ref'], q.Var('users')), { data: { name: 'User 1' }, credentials: { password: 'verysecret' } }),
          user2: q.Create(q.Select(['ref'], q.Var('users')), { data: { name: 'User 2' } }),
          user3: q.Create(q.Select(['ref'], q.Var('users')), { data: { name: 'User 3' } }),
        },
        {
          user1_role_create_posts: q.Create(
            q.Select(['ref'], q.Var('role_create_posts')),
            { delegates: [q.Select(['ref'], q.Var('user1'))] }
          ),
          token1: q.Create(q.Ref('tokens'), { instance: q.Select(['ref'], q.Var('user1')) }),
          token2: q.Create(q.Ref('tokens'), { instance: q.Select(['ref'], q.Var('user2')) }),
          token3: q.Create(q.Ref('tokens'), { instance: q.Select(['ref'], q.Var('user3')) }),
        }
      )
    }
  )).catch(err => err)
  // console.log(res2)

  user1Client = createClient(res2.tokens.token1.secret)
})

afterAll(async () => {
  // return adminClient.query(
  //   q.Delete(db.database)
  // )
})


describe('access queries', () => {
  it('fails to delegate on instance of class where class is given permissions', async () => {
    const post = await user1Client.query(
      q.Create(q.Class('posts'), { data: { title: 'One '}})
    ).catch(e => e)
    expect(post.name).toEqual('PermissionDenied')
  })

  // it('is slow?', async () => {
  //   jest.setTimeout(20000)
  //   const count = 100;
  //   const userIds = []
  //   for (var i = 0; i < count; i++) {
  //     // user_refs.push(q.Ref(q.Class('users'), i))
  //     userIds.push(i)
  //   }

  //   const permissions = [
  //     q.Ref(q.Class('roles'), 1),
  //     q.Ref(q.Class('roles'), 2),
  //     q.Ref(q.Class('roles'), 3),
  //   ]

  //   const res = await client.query(
  //     q.Map(
  //       userIds,
  //       q.Lambda(
  //         'id', 
  //         q.Let(
  //           {
  //             user: q.Create(q.Ref(q.Class('users'), q.Var('id')), { data: { id: q.Var('id') } })
  //           },
  //           q.Call(q.Function('add_permissions'), permissions, q.Select(['ref'], q.Var('user')))
  //         )
  //       )
  //     )
  //   ).catch(err => err)

  //   console.log(res)

  //   // console.log(user_refs.length)

  // })
  // TODO: Test adding permissions after token is issued.
})



