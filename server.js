import express from 'express';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import KNEX from 'knex';
import Clarifai from 'clarifai'

const API_keys = { CLARIFAI_API_KEY : "API_KEY_HERE" }
const Clarifai_app = new Clarifai.App({apiKey: API_keys.CLARIFAI_API_KEY});
const app = express();
const knex = KNEX({
  client: 'pg',
  connection : 'postgres://postgres:336699@localhost/smartbrain'
});

app.use(express.json());
app.use(cors());


// checking whether two or more response can be accepted or not
app.get("/",(request, response)=>{res.status(200).json("Hi There, this is working, check it out")})

// signin form is to confirm the user, so we get the input data and cross-verify with the data we have
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

// register form is to accept new user and also check whether the details match with the previous user
// if details match with the previous user then return already a member or use different credentials
// if it is new user then add the data to the database.users array
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

// if the user need to get the details for his/her profile
// url /profile/:id -> the syntax ":id" means that we can grab the text whatever is replaced by id
// like /profile/nail or /profile/vijay - in these urls we can grab the text nail or vijay from the urls 
// then can cross verify with our database and then display their profile data this then have to be get request
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


// ranking is based on the number of images user uploaded
// /image to update the entries count
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
