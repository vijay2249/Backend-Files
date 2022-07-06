import express from 'express';
import bcrypt from 'bcryptjs';
import cors from 'cors'; //cross origin resource sharing middleware npm package
import KNEX from 'knex';
import Clarifai from 'clarifai'

const Clarifai_app = new Clarifai.App({apiKey: process.env.CLARIFAI_API_KEY});
const app = express();
const knex = KNEX({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  }
});

app.use(express.json()); //parse the incoming requests with JSON payloads and is based upon the bodyparser.
app.use(cors());

// app.get(<url route>, (request, response)=> {<function to do>})
app.get("/",(request, response)=>{response.status(200).json("Hi There, this is working, check it out")})

app.post("/signin", (request, response) =>{
  const { email, password } = request.body.signInData;
  knex.select('secret', 'email').from('login').where({email: email})
    .then(data=>{
      if(data.length === 0){
        response.status(404).json("error")
      }
      else if(bcrypt.compareSync(password, data[0].secret)){
        knex('userinfo').select('username','entries','email').where({email:data[0].email})
          .then(user=>{
            response.status(200).json(user[0])
          })
          .catch(err => response.status(404).json("error"))
      }
      else{
        response.status(400).json("error")
      }
    })
    .catch(err => response.status(400).json("error"))
})

app.post("/register", (request,response)=>{
  const { email, username, password } = request.body.registerData;
  const secret = bcrypt.hashSync(password);
  knex.transaction(t =>{
    t.insert({
      secret:secret,
      email:email
    })
    .into('login')
    .returning('email')
    .then(loginMail =>{
      t('userinfo')
        .returning('*')
        .insert({
          username: username,
          email: loginMail[0],
          date_joined: new Date()
        })
        .then(user => {
          delete user[0].id
          delete user[0].date_joined
          response.status(200).json(user[0])
        })
    })
    .then(t.commit)
    .catch(t.rollback)
  })
    .catch(err => {response.status(400).json("error")})
})

app.get("/profile/:username", (request, response)=>{
  const {username} = request.params;
  knex('userinfo').where({username})
    .then(user =>{
      if(user.length === 0){
        response.status(404).json("No such user exists");
      }
      else{
        delete user[0].id;
        response.status(200).json(user)
      }
    })
    .catch(err => response.status(404).json("error"))
})

app.put("/images",(request, response)=>{
  const { username, imageURL } = request.body;
  Clarifai_app.models.predict(Clarifai.FACE_DETECT_MODEL,imageURL)
    .then(res=>{
      res = res.outputs[0].data
      let entries = (res.regions)? res.regions.length: 0
      knex('userinfo')
      .where('username','=',username)
      .increment('entries',entries)
      .returning('entries')
      .then(data => {
        if(!res.regions){ res = "error"}
        data.push(res)
        response.status(200).json(data)
      })
      .catch(err => response.status(404).json(err))
    })
    .catch(err => {console.log(err);response.status(400).json(err)})
})

app.listen(process.env.PORT || 443, ()=>{
  console.log(`app listening in port ${process.env.PORT || 443}`)
})
