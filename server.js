// FitPulse CRM API  -  POST/GET/PUT /api/enquiries  (+ GET/PUT /api/settings)
const express=require('express'),mongoose=require('mongoose'),cors=require('cors'),path=require('path');
const ADMIN_KEY=process.env.ADMIN_KEY||'admin123';
const app=express();app.use(cors(),express.json(),express.static(path.join(__dirname,'public')));
const Enquiry=mongoose.model('gym_enquiries',new mongoose.Schema({
 name:{type:String,required:true},gymName:String,phone:{type:String,required:true,match:/^\+91[6-9]\d{9}$/},
 city:String,members:String,message:String,planInterest:{type:String,default:'Growth'},
 status:{type:String,enum:['New','Contacted','Converted','Lost'],default:'New'},
 created_at:{type:Date,default:Date.now}},{collection:'gym_enquiries'}));
const Setting=mongoose.model('settings',new mongoose.Schema({key:{type:String,unique:true},value:String}));
const auth=(q,s,n)=>q.headers['x-admin-key']===ADMIN_KEY?n():s.status(401).json({error:'Unauthorized'});
app.post('/api/enquiries',async(q,s)=>{try{s.status(201).json(await Enquiry.create({...q.body,status:'New'}))}catch(e){s.status(400).json({error:e.message})}});
app.get('/api/enquiries',auth,async(q,s)=>s.json(await Enquiry.find().sort({created_at:-1})));
app.put('/api/enquiries/:id',auth,async(q,s)=>{try{s.json(await Enquiry.findByIdAndUpdate(q.params.id,{status:q.body.status},{new:true,runValidators:true}))}catch(e){s.status(400).json({error:e.message})}});
app.get('/api/settings',async(q,s)=>{const d=await Setting.findOne({key:'demoUrl'});s.json({demoUrl:d?d.value:''})});
app.put('/api/settings',auth,async(q,s)=>{await Setting.findOneAndUpdate({key:'demoUrl'},{value:q.body.demoUrl||''},{upsert:true});s.json({ok:true})});
mongoose.connect(process.env.MONGODB_URI||'mongodb+srv://akshayjai19001900_db_user:Akshay_2001@cluster0.fcvjhuq.mongodb.net/?appName=Cluster0').then(()=>app.listen(process.env.PORT||3000,()=>console.log('Running on http://localhost:'+(process.env.PORT||3000)))).catch(e=>{console.error('MongoDB error:',e.message);process.exit(1)});
