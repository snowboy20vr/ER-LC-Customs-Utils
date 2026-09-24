import "dotenv/config";
import {
 Client, GatewayIntentBits, Events, REST, Routes,
 ActionRowBuilder, ButtonBuilder, ButtonStyle,
 UserSelectMenuBuilder, StringSelectMenuBuilder,
 ModalBuilder, TextInputBuilder, TextInputStyle,
 ContainerBuilder, TextDisplayBuilder, MessageFlags,
 PermissionFlagsBits
} from "discord.js";

const C={
 token:process.env.DISCORD_TOKEN,
 clientId:process.env.CLIENT_ID,
 guildId:process.env.GUILD_ID,
 staffRoleId:process.env.STAFF_ROLE_ID,
 resultsChannelId:process.env.APPLICATION_RESULTS_CHANNEL_ID,
 buyerRoleId:process.env.BUYER_ROLE_ID
};
for(const k of ["token","clientId","guildId","staffRoleId","resultsChannelId","buyerRoleId"]){
 if(!C[k]) throw new Error("Missing .env value: "+k);
}

const TYPES=[
 ["Livery Creator","livery"],
 ["Uniform Creator","uniform"],
 ["Discord Server Creator","server"]
];
const GREEN=0x57F287, RED=0xED4245, BLUE=0x5865F2;
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});
const panels=new Map();

const typeName=v=>(TYPES.find(x=>x[1]===v)||["Unknown",v])[0];
function staff(i){
 if(!i.guild)return false;
 const owners=(process.env.OWNER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
 return owners.includes(i.user.id)||Boolean(i.member?.roles?.cache?.has(C.staffRoleId));
}
async function staffOnly(i){
 if(staff(i))return true;
 const v=new ContainerBuilder().setAccentColor(RED).addTextDisplayComponents(
  new TextDisplayBuilder().setContent("# ❌ Permission Denied\nYou do not have permission to use this command.")
 );
 await i.reply({components:[v],flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
 return false;
}
function newPanel(i,mode){
 const id=Math.random().toString(36).slice(2,12)+Date.now().toString(36);
 panels.set(id,{owner:i.user.id,mode,users:[],type:null});
 setTimeout(()=>panels.delete(id),900000);
 return id;
}
function getPanel(i,id){
 const p=panels.get(id);
 return p&&p.owner===i.user.id?p:null;
}
function makePanel(mode,id){
 const bulk=mode.startsWith("bulk"), accept=mode.includes("accept");
 const users=new UserSelectMenuBuilder()
  .setCustomId("users:"+id)
  .setPlaceholder(bulk?"Select one or more users":"Select the applicant")
  .setMinValues(1).setMaxValues(bulk?25:1);
 const types=new StringSelectMenuBuilder()
  .setCustomId("type:"+id)
  .setPlaceholder("Select the application type")
  .addOptions(TYPES.map(x=>({label:x[0],value:x[1]})));
 const go=new ButtonBuilder()
  .setCustomId("action:"+id)
  .setLabel(accept?"Accept Application":"Deny Application")
  .setStyle(accept?ButtonStyle.Success:ButtonStyle.Danger)
  .setEmoji(accept?"✅":"❌");
 const cancel=new ButtonBuilder().setCustomId("cancel:"+id).setLabel("Cancel").setStyle(ButtonStyle.Secondary);
 return new ContainerBuilder().setAccentColor(accept?GREEN:RED)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(
   "# "+(accept?"✅ Accept Application":"❌ Deny Application")+"\nSelect "+(bulk?"the applicants":"the applicant")+" and the application type, then press the button."
  ))
  .addActionRowComponents(new ActionRowBuilder().addComponents(users))
  .addActionRowComponents(new ActionRowBuilder().addComponents(types))
  .addActionRowComponents(new ActionRowBuilder().addComponents(go,cancel));
}
function resultView(text,color){
 return new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}
function resultModal(id,accepted){
 const input=new TextInputBuilder()
  .setCustomId(accepted?"notes":"reason")
  .setLabel(accepted?"Notes (optional)":"Reason")
  .setStyle(TextInputStyle.Paragraph)
  .setRequired(!accepted).setMaxLength(1000);
 return new ModalBuilder().setCustomId("result:"+id).setTitle(accepted?"Accept Application":"Deny Application")
  .addComponents(new ActionRowBuilder().addComponents(input));
}
async function postResult(i,p,accepted,extra){
 const ch=await i.guild.channels.fetch(C.resultsChannelId).catch(()=>null);
 if(!ch?.isTextBased())throw new Error("Application results channel is invalid or inaccessible.");
 const mentions=p.users.map(u=>"<@"+u.id+">").join("\n");
 let text;
 if(accepted){
  text="# ✅ Application Accepted\n**Applicant(s):**\n"+mentions+"\n\n**Application Type:** "+typeName(p.type)+"\n**Accepted By:** "+i.user;
  if(extra)text+="\n\n**Notes:**\n"+extra;
 }else{
  text="# ❌ Application Denied\n**Applicant(s):**\n"+mentions+"\n\n**Application Type:** "+typeName(p.type)+"\n**Denied By:** "+i.user+"\n\n**Reason:**\n"+extra;
 }
 await ch.send({
  components:[resultView(text,accepted?GREEN:RED)],
  flags:MessageFlags.IsComponentsV2,
  allowedMentions:{users:p.users.map(u=>u.id)}
 });
}

const commands=[
 {name:"accept",description:"Accept an application."},
 {name:"deny",description:"Deny an application."},
 {name:"bulk",description:"Bulk application actions.",options:[
  {type:1,name:"accept",description:"Accept applications for multiple users."},
  {type:1,name:"deny",description:"Deny applications for multiple users."}
 ]},
 {name:"grant",description:"Give the Buyer role to a member.",options:[
  {type:6,name:"user",description:"Member to receive Buyer role.",required:true}
 ]},
 {name:"robux",description:"Calculate Roblox 30% tax.",options:[
  {type:4,name:"amount",description:"Robux amount before tax.",required:true,min_value:1}
 ]}
];

client.once(Events.ClientReady,async c=>{
 console.log("Logged in as "+c.user.tag);
 const rest=new REST({version:"10"}).setToken(C.token);
 const route=C.guildId?Routes.applicationGuildCommands(C.clientId,C.guildId):Routes.applicationCommands(C.clientId);
 await rest.put(route,{body:commands});
 console.log("Registered "+commands.length+" slash commands.");
});

client.on(Events.InteractionCreate,async i=>{
 try{
  if(i.isChatInputCommand()){
   if(!(await staffOnly(i)))return;
   if(i.commandName==="accept"||i.commandName==="deny"){
    const id=newPanel(i,i.commandName);
    return i.reply({components:[makePanel(i.commandName,id)],flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
   }
   if(i.commandName==="bulk"){
    const sub=i.options.getSubcommand(),id=newPanel(i,"bulk_"+sub);
    return i.reply({components:[makePanel("bulk_"+sub,id)],flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
   }
   if(i.commandName==="grant"){
    const u=i.options.getUser("user",true);
    const m=await i.guild.members.fetch(u.id).catch(()=>null);
    if(!m)return i.reply({content:"❌ That user is not in this server.",ephemeral:true});
    const role=await i.guild.roles.fetch(C.buyerRoleId).catch(()=>null);
    if(!role)return i.reply({content:"❌ BUYER_ROLE_ID is invalid.",ephemeral:true});
    const me=i.guild.members.me;
    if(!me?.permissions.has(PermissionFlagsBits.ManageRoles))return i.reply({content:"❌ I need Manage Roles.",ephemeral:true});
    if(role.position>=me.roles.highest.position)return i.reply({content:"❌ The Buyer role must be below my highest role.",ephemeral:true});
    if(m.roles.cache.has(role.id))return i.reply({content:"ℹ️ "+m+" already has the Buyer role.",ephemeral:true});
    await m.roles.add(role,"Buyer role granted by "+i.user.tag);
    return i.reply({content:"✅ Granted the Buyer role to "+m+".",ephemeral:true});
   }
   if(i.commandName==="robux"){
    const amount=i.options.getInteger("amount",true),after=Math.floor(amount*.7),tax=amount-after,needed=Math.ceil(amount/.7);
    return i.reply({embeds:[{title:"💰 Robux Tax Calculator",color:BLUE,fields:[
     {name:"Before Tax",value:amount.toLocaleString()+" Robux",inline:true},
     {name:"30% Tax",value:tax.toLocaleString()+" Robux",inline:true},
     {name:"After Tax",value:after.toLocaleString()+" Robux",inline:true},
     {name:"To Receive This Amount",value:needed.toLocaleString()+" Robux before tax"}
    ]}],ephemeral:true});
   }
  }

  if(i.isUserSelectMenu()&&i.customId.startsWith("users:")){
   const id=i.customId.slice(6),p=getPanel(i,id);
   if(!p)return i.reply({content:"❌ Panel expired. Run the command again.",ephemeral:true});
   p.users=i.values.map(x=>i.guild.members.cache.get(x)?.user).filter(Boolean);
   return i.deferUpdate();
  }

  if(i.isStringSelectMenu()&&i.customId.startsWith("type:")){
   const id=i.customId.slice(5),p=getPanel(i,id);
   if(!p)return i.reply({content:"❌ Panel expired. Run the command again.",ephemeral:true});
   p.type=i.values[0];
   return i.deferUpdate();
  }

  if(i.isButton()){
   const parts=i.customId.split(":"),action=parts[0],id=parts[1],p=getPanel(i,id);
   if(!p)return i.reply({content:"❌ Panel expired. Run the command again.",ephemeral:true});
   if(action==="cancel"){
    panels.delete(id);
    return i.update({components:[resultView("# 🚫 Cancelled\nThe application action was cancelled.",BLUE)],flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
   }
   if(p.users.length===0||!p.type)return i.reply({content:"❌ Select the applicant(s) and application type first.",ephemeral:true});
   return i.showModal(resultModal(id,p.mode.includes("accept")));
  }

  if(i.isModalSubmit()&&i.customId.startsWith("result:")){
   const id=i.customId.slice(7),p=getPanel(i,id);
   if(!p)return i.reply({content:"❌ Panel expired. Run the command again.",ephemeral:true});
   const accepted=p.mode.includes("accept"),extra=i.fields.getTextInputValue(accepted?"notes":"reason");
   await i.deferUpdate();
   await postResult(i,p,accepted,extra);
   panels.delete(id);
   return i.editReply({
    components:[resultView(accepted?"# ✅ Application Accepted\nThe result was posted successfully.":"# ❌ Application Denied\nThe result was posted successfully.",accepted?GREEN:RED)],
    flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral
   });
  }
 }catch(e){
  console.error("Interaction error:",e);
  const d={content:"❌ Something went wrong while processing that action.",ephemeral:true};
  if(i.replied||i.deferred)await i.followUp(d).catch(()=>{});else await i.reply(d).catch(()=>{});
 }
});

client.on(Events.Error,e=>console.error("Discord client error:",e));
process.on("SIGINT",()=>{client.destroy();process.exit(0)});
process.on("SIGTERM",()=>{client.destroy();process.exit(0)});
client.login(C.token);
