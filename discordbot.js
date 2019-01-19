const config = require('dotenv').config();
const Discord = require("discord.js");
const client = new Discord.Client();
const fastify = require('fastify')();
const monk = require('monk');
var db = monk("localhost/live_discord?auto_reconnect=true");
var db_stars = db.get("stars");
var db_accounts = db.get("accounts");
var db_rules = db.get("rules");
var db_messages = db.get("messages");
var db_guilds = db.get("guilds");

//db_stars.remove({});
//db_accounts.remove({});
//db_rules.remove({});
//db_messages.remove({});
//db_guilds.remove({});

if (false) {
  db_rules.find({}).then(
    rules => {
      console.log(rules);
    }
  );
}

var bot_guild;
var self_userid;

var subscribe_emoji = '✉';
var unsubscribe_emoji = '❌';
var dm_helptext = "\n\n*Type `help` for a list of commands*";

function parse_msg(text) {
  if (!text.match(/^\*\*.*?\*\* is live on .*\nhttps?:\/\//))
    return null;

  var name = text.replace(/^\*\*(.*?)\*\*[\s\S]*$/, "$1");
  if (name === text)
    return null;

  var site = text.replace(/^.*\nhttps?:\/\/(?:[^/]*\.)?([^/.]*)\.[a-z]+\/[\s\S]*$/, "$1");
  if (site === text)
    return null;

  var username = text.replace(/^.*\nhttps?:\/\/[^/]*\/([^/]*)[\s\S]*$/, "$1");
  if (username === text)
    return null;

  return {
    name,
    site,
    username
  };
}

async function get_sent_message(messageid) {
  var message = await db_messages.find({messageid});
  if (!message || message.length === 0)
    return null;

  return message[0];
}

function upush(array, item) {
  if (item === undefined)
    return;

  if (item instanceof Array) {
    item.forEach((x) => {
      upush(array, x);
    });
  } else {
    /*if (array.indexOf(item) < 0)
      array.push(item);*/
    var sitem = JSON.stringify(item);
    for (var i = 0; i < array.length; i++) {
      if (sitem === JSON.stringify(array[i])) {
        return;
      }
    }
    array.push(item);
  }
}

function uremove(array, item) {
  var sitem = JSON.stringify(item);
  for (var i = 0; i < array.length; i++) {
    if (sitem === JSON.stringify(array[i])) {
      array.splice(i, 1);
      return;
    }
  }
}

function init_message(properties, text, message) {
  if (!properties)
    properties = {type: "other"};

  properties.created_at = Date.now();
  properties.text = text;
  properties.messageid = message.id;

  return properties;
}

function senddm(userid, text, properties) {
  return new Promise((resolve, reject) => {
    client.fetchUser(userid).then(
      user => {
        user.send(text).then(
          message => {
            properties = init_message(properties, text, message);
            properties.user = userid;
            db_messages.insert(properties);

            resolve(message);
          },
          error => {
            console.log("Failed to send message '" + text + "' to user " + userid);
            console.dir(error);

            if (error &&
                error.name === "DiscordAPIError" &&
                error.code === 50007) {
              console.log("User " + userid + " blocked the bot, removing rules to preserve API limits");
              db_rules.remove({
                user: userid
              });
            }

            reject(error);
          }
        );
      },
      error => {
        console.error("Failed to find user " + userid);
        reject(error);
      }
    );
  });
}

async function send_channel(guildid, channelid, text, properties) {
  var guild = client.guilds.get(guildid);
  if (!guild) {
    return null;
  }

  var channel = guild.channels.get(channelid);
  if (!channel) {
    return null;
  }

  var message = await channel.send(text);
  properties = init_message(properties, text, message);
  properties.guild = guildid;
  properties.channel = channelid;

  db_messages.insert(properties);

  return message;
}

async function find_account_by_id(account_id) {
  var account = await db_accounts.find({account_id});
  if (!account || account.length === 0)
    return null;

  return account[0];
}

function find_account(properties) {
  return new Promise((resolve, reject) => {
    if (("site" in properties) &&
        (("username" in properties) ||
         ("uid" in properties))) {
      var query = {
        site: properties.site
      };

      if ("uid" in properties) {
        query.uid = properties.uid;
      } else if ("username" in properties) {
        query.username = properties.username;
      } else {
        return resolve(null);
      }

      db_accounts.find(query).then(
        items => {
          if (!items || items.length === 0) {
            return resolve(null);
          }

          resolve(items[0]);
        },
        err => {
          reject(err);
        });
    } else {
      return resolve(null);
    }
  });
}

function find_star_by_id(id) {
  return new Promise((resolve, reject) => {
    db_stars.find({"star_id": id}).then(
      items => {
        if (!items || items.length === 0)
          return resolve(null);

        resolve(items[0]);
      },
      err => {
        reject(err);
      }
    );
  });
}

function find_star(properties) {
  return new Promise((resolve, reject) => {
    find_account(properties).then(
      account => {
        if (account) {
          return find_star_by_id(account.star_id).then(
            item => {
              if (!item)
                resolve(null);
              else
                resolve(item);
            },
            err => {
              reject(err);
            }
          );
        }

        var orquery = [];

        if ("name" in properties) {
          orquery.push({"name": properties.name});
        }

        if ("search" in properties) {
          var search = strip_search(properties.search);

          orquery.push({"search": search});
        }

        var query = {};
        if (orquery.length === 0) {
          return resolve(null);
        }

        if (orquery.length === 1) {
          query = orquery[0];
        } else {
          query = {"$or": orquery};
        }

        db_stars.find(query).then(
          items => {
            if (!items || items.length === 0)
              return resolve(null);

            resolve(items[0]);
          },
          err => {
            reject(err);
          }
        );
      },
      err => {
        reject(err);
      }
    );
  });
}

function get_star_accounts(starid) {
  return new Promise((resolve, reject) => {
    db_accounts.find({star_id: starid}).then(
      accounts => {
        if (!accounts || accounts.length === 0)
          return resolve([]);
        else
          resolve(accounts);
      },
      err => reject(err)
    );
  });
}

function strip_search(search) {
  return search.toLowerCase()
    .replace(/[-_'".,!/\s]/g, "")
    .replace(/^\$+/, "");
}

function extend_with_possible_array(original, el) {
  if (!(el instanceof Array)) {
    el = [el];
  }

  for (var i = 0; i < el.length; i++) {
    original.push(el[i]);
  }
}

function create_search(properties) {
  var search = [];

  if ("name" in properties) {
    search.push(properties.name);
  }

  if ("name_kr" in properties) {
    search.push(properties.name_kr);
  }

  var roman_groups = [];
  var korean_groups = [];
  var roman_member_names = [];
  var korean_member_names = [];


  if ("group" in properties) {
    extend_with_possible_array(roman_groups, properties.group);
  }

  if ("alt_groups_roman" in properties && properties.alt_groups_roman) {
    extend_with_possible_array(roman_groups, properties.alt_groups_roman);
  }

  if ("group_kr" in properties) {
    extend_with_possible_array(korean_groups, properties.group_kr);
  }

  if ("alt_groups" in properties && properties.alt_groups) {
    extend_with_possible_array(korean_groups, properties.alt_groups);
  }

  if ("member_name" in properties) {
    extend_with_possible_array(roman_member_names, properties.member_name);
  }

  if ("member_name_kr" in properties) {
    extend_with_possible_array(korean_member_names, properties.member_name_kr);
  }

  if ("nicks" in properties && properties.nicks && properties.nicks instanceof Array) {
    for (var i = 0; i < properties.nicks.length; i++) {
      var nick = properties.nicks[i];

      if (nick.hangul) {
        korean_member_names.push(nick.hangul);
      }

      if (nick.roman) {
        extend_with_possible_array(roman_member_names, nick.roman);
      }
    }
  }

  roman_groups.forEach(group => {
    roman_member_names.forEach(name => {
      search.push(group + " " + name);
    });
  });

  korean_groups.forEach(group => {
    korean_member_names.forEach(name => {
      search.push(group + " " + name);
    });
  });

  /*if ("member_name" in properties) {
    if ("group" in properties) {
      if (properties.group instanceof Array) {
        for (var i = 0; i < properties.group.length; i++) {
          search.push(properties.group[i] + " " + properties.member_name);
        }
      } else {
        search.push(properties.group + " " + properties.member_name);
      }
    }

    if ("alt_groups_roman" in properties && properties.alt_groups_roman) {
      var alt_groups = properties.alt_groups_roman;
      if (!(alt_groups instanceof Array)) {
        alt_groups = [alt_groups];
      }

      for (var i = 0; i < alt_groups.length; i++) {
        if (alt_groups[i]) {
          search.push(alt_groups[i] + " " + properties.member_name);
        }
      }
    }
  }

  if ("member_name_kr" in properties) {
    if ("group_kr" in properties) {
      search.push(properties.group_kr + " " + properties.member_name_kr);
    }

    if ("alt_groups" in properties && properties.alt_groups) {
      var alt_groups = properties.alt_groups;
      if (!(alt_groups instanceof Array)) {
        alt_groups = [alt_groups];
      }

      for (var i = 0; i < alt_groups.length; i++) {
        if (alt_groups[i]) {
          search.push(alt_groups[i] + " " + properties.member_name_kr);
        }
      }
    }
  }*/

  var newsearch = [];
  search.forEach(item => {
    upush(newsearch, strip_search(item));
  });

  return newsearch;
}

function getRandomArbitrary(min, max) {
  return (Math.random() * (max - min) + min) >> 0;
}

function create_id(db, key) {
  var id = sanitize_id(getRandomArbitrary(1, 10*1000*1000));
  console.log("Trying id ", id);

  var query = {};
  query[key] = id;

  return new Promise((resolve, reject) => {
    db.find(query).then(
      star => {
        if (star && star.length > 0) {
          create_id().then(
            id => {
              resolve(id);
            },
            err => {
              reject(err);
            }
          );
        } else {
          resolve(id);
        }
      },
      err => {
        reject(err);
      }
    );
  });
}

function create_star_id() {
  return create_id(db_stars, "star_id");
}

function create_account_id() {
  return create_id(db_accounts, "account_id");
}

function create_rule_id() {
  return create_id(db_rules, "rule_id");
}

function update_account(account, properties) {
  var changed = false;

  if (properties.username && account.username !== properties.username) {
    account.username = properties.username;
    changed = true;
  }

  if (properties.uid && account.uid !== properties.uid) {
    account.uid = properties.uid;
    changed = true;
  }

  return new Promise((resolve, reject) => {
    if (changed) {
      db_accounts.update(account._id, account).then(
        account => {
          resolve(account);
        },
        err => {
          reject(err);
        }
      );
    } else {
      resolve(account);
    }
  });
}

function update_star(star, properties) {
  var changed = false;

  var copyprop = [
    "group",
    "group_kr",
    "name",
    "name_kr",
    "member_name",
    "member_name_kr",
    "alt_groups",
    "alt_groups_roman",
    "noupload",
    "group_noupload"
  ];

  var newproperties = {};

  newproperties.search = create_search(properties);

  copyprop.forEach(prop => {
    if (prop in properties) {
      newproperties[prop] = properties[prop];
    }
  });

  for (var prop in newproperties) {
    if (!(prop in star)) {
      changed = true;
      star[prop] = newproperties[prop];
    } else if (JSON.stringify(star[prop]) !== JSON.stringify(newproperties[prop])) {
      changed = true;
      star[prop] = newproperties[prop];
    }
  }

  return new Promise((resolve, reject) => {
    if (!changed) {
      return resolve(star);
    }

    if (star._id) {
      db_stars.update(star._id, star).then(
        star => {
          resolve(star);
        },
        err => {
          reject(err);
        }
      );
    } else {
      db_stars.insert(star).then(
        star => {
          resolve(star);
        },
        err => {
          reject(err);
        }
      );
    }
  });
}

async function add_account(properties) {
  var star = await find_star(properties);

  if (star) {
    star = await update_star(star, properties);

    if (!properties.site && (!properties.uid || !properties.username))
      return star;

    var account = await find_account(properties);
    if (account) {
      var newaccount = await update_account(account, properties);
      return newaccount;
    }

    var id = await create_account_id();

    account = {
      site: properties.site,
      account_id: id,
      star_id: star.star_id,
      created_at: Date.now()
    };

    if (properties.uid) {
      account.uid = properties.uid;
    }

    if (properties.username) {
      account.username = properties.username;
    }

    var newaccount = await db_accounts.insert(account);
    return newaccount;
  } else {
    var id = await create_star_id();

    star = {
      star_id: id,
      created_at: Date.now()
    };

    await update_star(star, properties);
    var account = await add_account(properties);
    return account;
  }
}

async function create_rule(options) {
  // {
  //   user: user_id -- dm
  //     or:
  //   guild: guild_id
  //   channel: channel_id
  //
  //   star_id: star_id
  //     or:
  //   account_id: account_id
  //     or:
  //   all: true
  //
  //   replays: bool
  //
  //   rule_id: rule_id
  // }

  var rule = await db_rules.find(options);
  if (rule && rule.length > 0)
    return [rule[0], false];

  if (!options.rule_id) {
    options.rule_id = await create_rule_id();
  }

  if (!options.created_at) {
    options.created_at = Date.now();
  }

  console.log(options);
  var rule = await db_rules.insert(options);
  return [rule, true];
}

function remove_rule(rule_id, source) {
  console.log("Removing rule: " + rule_id + " (because of " + source + ")");
  return db_rules.remove({rule_id: sanitize_id(rule_id)}, {multi: false});
}

async function get_rules_for_account(account, replay) {
  orquery = [
    {star_id: sanitize_id(account.star_id)},
    {account_id: sanitize_id(account.account_id)},
    {all: true}
  ];

  orquery1 = [];

  if (!replay) {
    orquery1.push({replays: true});
    orquery1.push({replays: false});
  } else {
    orquery1.push({replays: true});
    orquery1.push({replays: "only"});
  }

  var query = {
    "$and": [
      {"$or": orquery},
      {"$or": orquery1}
    ]
  };

  var rules = await db_rules.find(query);

  return rules;
}

async function get_rules_for_user_account(userid, account) {
  var orquery = [];

  if (account.star_id) {
    orquery.push({star_id: sanitize_id(account.star_id)});
  }

  if (account.account_id) {
    orquery.push({account_id: sanitize_id(account.account_id)});
  }

  if (orquery.length === 0)
    return [];

  return await db_rules.find({
    "$or": orquery,
    user: sanitize_id(userid)
  });
}

function is_subscribed(userid, account) {
  if (!(userid in users))
    return false;

  if (users[userid].subbed_titles.indexOf(account.name) >= 0) {
    return true;
  }

  if (users[userid].subbed_accounts.indexOf(account.site + "/" + account.username) >= 0) {
    return true;
  }

  return false;
}

function get_subscribed_users(account) {
  var out = [];
  for (var user in users) {
    if (is_subscribed(user, account))
      out.push(user);
  }

  return out;
}

function base_rule(account, replays) {
  var options = {
    replays: replays
  };

  if (account === "*") {
    options.all = true;
  } else if (account.account_id) {
    options.account_id = account.account_id;
  } else if (account.star_id) {
    options.star_id = account.star_id;
  }

  return options;
}

function sanitize_id(id) {
  if (typeof id === "number")
    id = id + "";

  if (typeof id !== "string")
    throw "id is not a string";

  if (!id.match(/^\s*[0-9]+\s*$/))
    throw "id is not a number";

  return id.replace(/\s*/g, "");
}

function get_subscribe_name(account) {
  var text = "undefined";

  if (account === "*")
    text = "all accounts";
  else if (account.name)
    text = account.name;
  else if (account.username)
    text = "@" + account.username;

  return text;
}

async function subscribe_user(userid, account, replays) {
  var options = base_rule(account, replays);
  options.user = userid;

  var output = await create_rule(options);

  if (output[1])
    senddm(userid, "Subscribed to **" + get_subscribe_name(account) + "**" + dm_helptext);
  else
    senddm(userid, "Already subscribed to **" + get_subscribe_name(account) + "**" + dm_helptext);
}

async function subscribe_channel(message, guild, channel_id, account, replays, pings) {
  var options = base_rule(account, replays);
  options.guild = guild;
  options.channel = channel_id;
  options.ping_roles = pings;

  var output = await create_rule(options);

  if (message) {
    if (output[1])
      message.reply("Subscribed to **" + get_subscribe_name(account) + "**");
    else
      message.reply("Already subscribed to **" + get_subscribe_name(account) + "**");
  }
}

function discord_invite_msg(userid) {
  if (!bot_guild.members.get(userid)) {
    return "*Join the LiveBot server here: " + config.parsed.DISCORD_INVITE_LINK + "*";
  }

  return "";
}

async function unsubscribe(message, ruleid) {
  try {
    var removed = await remove_rule(ruleid, "unsubscribe_func");
    if (message) {
      if (removed && removed.result.n > 0) {
        message.reply("Removed rule **" + ruleid + "**");
      } else {
        message.reply("Rule **" + ruleid + "** not found");
      }
    }
  } catch (e) {
    console.error(e);
    if (message) {
      message.reply("Unknown error removing rule **" + ruleid + "**");
    }
  }
}

async function reset_activity() {
  //await client.user.setPresence({game: null});
  client.user.setActivity(null);
  //client.user.setPresence({game: {name: " ", type: 0}});
}

client.on('ready', async () => {
  try {
    await reset_activity();
  } catch (e) {
    console.error("Unable to reset client activity", e);
  }

  self_userid = client.user.id;
  bot_guild = client.guilds.get(config.parsed.DISCORD_GUILD_ID);
  if (!bot_guild) {
    console.log("Bot guild is missing?");
  }

  console.log("Discord ready");
});

client.on('error', (err) => {
  console.error(err);
});

async function check_accepted_guild(guild) {
  if (guild.id === config.parsed.DISCORD_GUILD_ID)
    return true;

  var guild_ok = await db_guilds.find({
    guild_id: guild.id,
    ok: true
  });

  if (!guild_ok || guild_ok.length === 0) {
    console.log("Guild " + guild.id + " is not whitelisted, leaving");
    guild.leave();
    return false;
  }

  return true;
}

client.on('guildCreate', guild => {
  check_accepted_guild(guild);
});

client.on('message', async message => {
  if (message.author.id === self_userid ||
      message.author.bot)
    return;

  var msg = message.content
      .replace(/^\s*/, "")
      .replace(/\s*$/, "");

  if (message.channel.type !== "dm" &&
      !msg.startsWith("<@" + self_userid + ">") &&
      !msg.startsWith("<@!" + self_userid + ">") &&
      !msg.toLowerCase().startsWith("!livebot"))
    return;

  if (message.channel.type !== "dm" &&
      !message.member.roles.find("name", "LiveBotAdmin")) {
    if (!message.guild) {
      console.log("Not in a guild " + message.author.id + " '" + message.content + "' " + message.channel.type);
      message.reply("Not in a guild? You shouldn't see this");
      return;
    }

    if (message.author.id !== message.guild.ownerID) {
      message.reply("You need the `LiveBotAdmin` role to modify the bot's settings for the guild");
      return;
    }
  }

  var is_user = message.channel.type === "dm";

  var newmsg = msg.replace(/^(?:<@[^>]*[0-9]+>|!LiveBot)\s+/i, "");
  if (newmsg === msg && false) {
    console.log("Error processing message: " + msg);
    return;
  }
  msg = newmsg;

  console.log(msg);

  var newmsg = msg
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
  var args = [];
  var quote = null;
  for (var i = 0; i < 1000; i++) {
    if (!newmsg)
      break;

    if (newmsg[0] === '"' ||
        newmsg[0] === "'")
      quote = newmsg[0];
    else
      quote = null;

    var match;
    if (!quote)
      match = newmsg.match(/^([\S]*)\s*([\s\S]*)$/);
    else {
      var regex = new RegExp("^" + quote + "(.*?)" + quote + "\\s*([\\s\\S]*)$");
      match = newmsg.match(regex);
      if (!match) {
        message.reply("Unterminated quote?");
        return;
      }
    }

    args.push(match[1]);

    newmsg = match[2];
  }

  console.log(args);
  var command = args[0].toLowerCase();

  var youre = is_user ? "you are" : "your guild is";
  var replays_help = [
    "The `with_replays` argument determines whether or not replays are included. Possible values:",
    "",
    "    * `true`  - Subscribes to both livestreams and replays",
    "    * `false` - Only subscribes to livestreams",
    "    * `only`  - Only subscribes to replays"
  ].join("\n");

  var commands = {
    "help": {
      emoji: "❓",
      shorthelp: "This message",
      longhelp: [
        "This message (and the commands) vary on whether you're contacting the bot via DM, or if you're in a server you own.",
        "Commands sent in a DM affect personal notifications, while commands sent in a server will affect that server."
      ].join("\n")
    },
    "list": {
      emoji: "📝",
      shorthelp: "Lists the lives " + youre + " currently subscribed to"
    },
    "subscribe": {
      emoji: subscribe_emoji,
      sample_args: "group_and_member_name with_replays",
      shorthelp: "Subscribes yourself to a person's lives",
      longhelp: [
        "The group and member name needs to be quoted, but spacing, punctuation, and casing is ignored.",
        "",
        replays_help,
        "",
        "Examples:",
        "",
        "       `subscribe 'snsd taeyeon' true`",
        "       `subscribe \"girl's generation taeyeon\" true`",
        "       `subscribe \"Girls Generation Taeyeon\" true`",
        "       `subscribe '소녀시대 태연' true`",
      ].join("\n")
    },
    "unsubscribe": {
      emoji: unsubscribe_emoji,
      sample_args: "rule_id",
      shorthelp: "Removes a subscription",
      longhelp: [
        "The `rule_id` can be found using the `list` command",
        "",
        "Examples:",
        "",
        "       `unsubscribe 12345`"
      ].join("\n")
    }
  };

  if (!is_user) {
    commands.subscribe.sample_args = "channel_id group_and_member_name with_replays [ping_role_id]";
    commands.subscribe.shorthelp = "Subscribes a channel to a person's lives";
    commands.subscribe.longhelp = [
      "To find the `channel_id`, enable Developer Mode, right click on the channel, and select 'Copy ID'",
      "",
      "The `group_and_member_name` needs to be quoted, but spacing, punctuation, and casing is ignored.",
      "",
      replays_help,
      "",
      "`ping_role_id` is optional, but if specified, the specified role will be pinged.",
      "    To find the role ID, make sure the rule can be pinged, and write `\\@rolename`. After sending, if the message is `<@&12345>`, the role ID is `12345`.",
      "",
      "Examples:",
      "",
      "       `subscribe 123456 'snsd taeyeon' true 7890`",
      "       `subscribe 123456 \"girl's generation taeyeon\" true`",
      "       `subscribe 123456 \"Girls Generation Taeyeon\" true 7890`",
      "       `subscribe 123456 '소녀시대 태연' true`",
    ].join("\n");
  }

  switch (command) {
  case "help":
    var reply = "**Commands available:**\n\n";

    for (var cmd in commands) {
      var text = "";

      var ccmd = commands[cmd];
      if (ccmd.emoji)
        text += ccmd.emoji + " ";

      text += "`" + cmd;

      if (ccmd.sample_args)
        text += " " + ccmd.sample_args;

      text += "`";

      if (ccmd.shorthelp)
        text += " - " + ccmd.shorthelp;

      text += "\n\n";

      if (ccmd.longhelp)
        text += ccmd.longhelp + "\n\n";

      text = text.replace(/\s*$/, "") + "\n\n\n";

      reply += text;
    }

    reply += discord_invite_msg(message.author.id);

    message.reply(reply);
    break;
  case "subscribe":
    arglength = is_user ? 3 : 4;
    if (args.length < arglength) {
      return message.reply("Needs at least " + arglength + " arguments (use the `help` command for more information)");
    }

    var star_search = is_user ? args[1] : args[2];
    var replays = is_user ? args[2] : args[3];

    if (replays !== "true" &&
        replays !== "false" &&
        replays !== "only") {
      var memberhelp = " (use the `help` command for more information)";
      if (typeof star_search === "string" && star_search.indexOf(" ") < 0) {
        memberhelp = " (did you forget to add quotes around the member name? Use the `help` command for examples)";
      }

      return message.reply("The `with_replays` argument needs to be one of `true`, `false`, or `only`" + memberhelp);
    }

    if (replays === "true")
      replays = true;
    else if (replays === "false")
      replays = false;

    var channel_id = null;
    if (!is_user) {
      var ok = false;
      try {
        channel_id = sanitize_id(args[1]);
        if (channel_id)
          ok = true;
      } catch (e) {
      }

      if (!ok) {
        return message.reply("Invalid `channel_id` (make sure you copied the ID, not the name of the channel)");
      }

      if (!message.guild) {
        return message.reply("Not in a guild? You shouldn't see this");
      }

      if (!message.guild.channels.get(channel_id)) {
        return message.reply("Channel ID '" + channel_id + "' does not exist, or is not accessable by the bot");
      }
    }

    var pings = [];
    if (!is_user) {
      if (args.length > 4 && args[4]) {
        var ok = false;
        var ping = null;
        try {
          ping = sanitize_id(args[4]);
          if (ping)
            ok = true;
        } catch (e) {}

        if (!ok) {
          return message.reply("Invalid `role_id`");
        }

        if (!message.guild) {
          return message.reply("Not in a guild? You shouldn't see this");
        }

        if (!message.guild.roles.get(ping)) {
          return message.reply("Role ID '" + ping + "' does not exist");
        }

        pings.push(ping);
      }
    }

    var star;
    if (star_search === "*") {
      star = star_search;
    } else {
      star = await find_star({search: star_search});
      if (!star) {
        star = await find_star({username: star_search, site: "instagram"});
        if (!star) {
          var text = "Unable to find `" + star_search + "`.\n\nThe account may be in the database, but is not currently accessible to the bot. Use the `#account-suggestions` channel in the LiveBot server to request a new account.";

          var invite_msg = discord_invite_msg(message.author.id);
          if (invite_msg)
            text += "\n\n" + invite_msg;

          return message.reply(text);
        }
      }
    }

    if (is_user) {
      subscribe_user(message.author.id, star, replays);
    } else {
      subscribe_channel(message, message.guild.id, channel_id, star, replays, pings);
    }
    break;
  case "unsubscribe":
    if (args.length < 2) {
      return message.reply ("Needs `rule_id` (use the `list` command to find rules you are subscribed to)");
    }

    var rule_id = args[1];
    var ok = false;
    try {
      rule_id = sanitize_id(rule_id);
      if (rule_id)
        ok = true;
    } catch(e) {
    }

    if (!ok) {
      return message.reply("Invalid `rule_id` (this should be a number, you can find subscribed rules using the `list` command)");
    }

    var query = {rule: rule_id};

    if (is_user) {
      query.user = message.author.id;
    } else {
      query.guild = message.guild.id;
    }

    var rule = await db_rules.find();
    if (!rule) {
      return message.reply("Rule " + rule_id + " does not exist");
    }

    unsubscribe(message, rule_id);
    break;
  case "list":
    var rules = [];

    if (is_user) {
      rules = await db_rules.find({user: message.author.id});
    } else {
      rules = await db_rules.find({guild: message.guild.id});
    }

    if (!rules || rules.length === 0) {
      return message.reply("No rules found");
    }

    var message_text = "**Rules**\n\n";

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var text = "`" + rule.rule_id + "` ";

      var account_name = "";

      if (rule.all) {
        account_name = "all accounts";
      } else if (rule.star_id) {
        var star = await find_star_by_id(rule.star_id);
        if (!star) {
          account_name = "undefined";
        } else {
          account_name = star.name;
        }
      } else if (rule.account_id) {
        var accounts = await db_accounts.find({account_id: rule.account_id});
        if (!accounts || accounts.length === 0) {
          account_name = "undefined";
        } else {
          account_name = account.username;
        }
      }

      text += "**" + account_name + "**";

      if (!is_user) {
        var channel_name = "";
        var guild = client.guilds.get(rule.guild);
        var ping_text = "";
        if (!guild) {
          channel_name = "undefined guild";
        } else {
          var channel = guild.channels.get(rule.channel);
          if (!channel) {
            channel_name = "undefined channel";
          } else {
            channel_name = channel.name;
          }

          if (rule.ping_roles && rule.ping_roles.length > 0) {
            ping_text += ", pings ";
            for (var j = 0; j < rule.ping_roles.length; j++) {
              var role = guild.roles.get(rule.ping_roles[j]);
              var rolename = "undefined-role";
              if (role) {
                rolename = role.name;
              }
              ping_text += " `@" + rolename + "`";
            }
          }
        }

        text += " on `#" + channel_name + "`" + ping_text;
      }

      if (rule.replays === true) {
        text += " (with replays)";
      } else if (rule.replays === "only") {
        text += " (only replays)";
      } else if (rule.replays === false) {
        text += " (no replays)";
      }

      message_text += text + "\n";
    }

    message.reply(message_text);
    break;
  case "role":
    if (is_user || !message.guild) {
      message.reply("Not in guild");
      break;
    }

    if (args.length < 2) {
      message.reply("Need role name");
      break;
    }

    var reply_text = "";
    message.guild.roles.forEach((role) => {
      if (role.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "") ===
          args[1].toLowerCase().replace(/[^a-zA-Z0-9]/g, "")) {
        reply_text += role.name + " " + role.id;
      }
    });

    if (!reply_text) {
      message.reply("No role found");
      break;
    }

    message.reply(reply_text);
    break;
  default:
    message.reply("Unknown command (use the `help` command for more information)");
    break;
  }
});

// TODO: use proper API
client.on('raw', async function(event) {
  if (!event || !event.t || !event.d)
    return;

  if (event.t === 'MESSAGE_REACTION_ADD') {
    if (event.d.user_id === self_userid) {
      return;
    }

    var event_user_id = sanitize_id(event.d.user_id);

    var user = client.users.get(event_user_id);
    var channel = client.channels.get(event.d.channel_id) || await user.createDM();
    /*if (event.d.channel_id !== lives_channel_id) {
      return;
    }*/

    channel.fetchMessage(event.d.message_id).then(
      async message => {
        if (message.author.id !== self_userid) {
          return;
        } else {
          var emoji = event.d.emoji.name;

          if (emoji !== subscribe_emoji &&
              emoji !== unsubscribe_emoji)
            return;

          //var parsed = parse_msg(message.content);
          //console.log(parsed);
          var sent_message = await get_sent_message(event.d.message_id);

          if (sent_message.type !== "live" &&
              sent_message.type !== "replay")
            return;

          var account = await find_account_by_id(sent_message.account);
          if (!account)
            return;

          var star = await find_star_by_id(account.star_id);
          if (!star)
            return;

          //console.log(account);
          if (event.d.emoji.name === subscribe_emoji) {
            if (sent_message.type === "live")
              subscribe_user(event_user_id, star, false);
            else if (sent_message.type === "replay")
              subscribe_user(event_user_id, star, "only");
            //console.log("sub");
          } else if (event.d.emoji.name === unsubscribe_emoji) {
            //unsubscribe(event_user_id, parsed);
            var rules = await get_rules_for_user_account(event_user_id, account);
            if (rules && rules.length > 0) {
              rules.forEach(rule => {
                if (sent_message.type === "live") {
                  if (rule.replays === true || rule.replays === false)
                    remove_rule(rule.rule_id, "emoji");
                } else if (sent_message.type === "replay") {
                  if (rule.replays === true || rule.replays === "only")
                    remove_rule(rule.rule_id, "emoji");
                }
              });
              senddm(event_user_id, "Unsubscribed from **" + star.name + "**'s " + sent_message.type + "s");
            } else {
              senddm(event_user_id, "Nothing to unsubscribe from");
            }
            //console.log("unsub");
          }
        }
        //console.log(message);
      },
      () => {
        console.error("Unable to fetch message: " + event.d.message_id);
      }
    );
  }
});

var clear_activity_timeout = null;
var clear_activity_time = 30*1000;
var current_watching = null;
async function clear_status() {
  try {
    //await client.user.setActivity(null);
    await reset_activity();

    if (clear_activity_timeout) {
      clearTimeout(clear_activity_timeout);
      clear_activity_timeout = null;
    }

    if (current_watching) {
      current_watching = null;
    }
  } catch (e) {
    console.error("Error clearing activity: ", e);
  }
}

async function set_status(body) {
  if (!body || body.type !== "live")
    return;

  if (current_watching && current_watching.date && body.date && body.date < current_watching.date)
    return;

  if (clear_activity_timeout) {
    clearTimeout(clear_activity_timeout);
    clear_activity_timeout = null;
  }

  try {
    await client.user.setActivity(body.name, { type: 'WATCHING' });

    current_watching = body;
    clear_activity_timeout = setTimeout(clear_status, clear_activity_time);
  } catch (e) {
    console.error(e);
  }
}

async function send_message(body) {
  var sitename = "";
  switch (body.site) {
  case "instagram":
    sitename = "Instagram";
    break;
  case "periscope":
    sitename = "Periscope";
    break;
  }

  if (body.type === "live" ||
      body.type === "replay") {
    var noupload_msg = "";
    if (true) {
      if (body.noupload || body.group_noupload) {
        noupload_msg = " *(will likely not be uploaded)*";
      }
    }

    var message_text, subscribe_msg, unsubscribe_msg;

    if (body.type === "live") {
      message_text = "**" + body.name + "** is live on " + sitename + noupload_msg + "\n" + body.watch_link + "\n\n";
      subscribe_msg = "*Use " + subscribe_emoji + " to subscribe to future lives by this person*";
      unsubscribe_msg = "*Use " + unsubscribe_emoji + " to unsubscribe from future lives by this person*";
    } else if (body.type === "replay") {
      message_text = "Replay of **" + body.name + "**'s " + sitename + " livestream\n\n" + body.broadcast_guid + "\n\n";
      subscribe_msg = "*Use " + subscribe_emoji + " to subscribe to future replays by this person*";
      unsubscribe_msg = "*Use " + unsubscribe_emoji + " to unsubscribe to future replays by this person*";
    }

    var account = await find_account(body);
    var rules = await get_rules_for_account(account, body.type === "replay");

    try {
      set_status(body);
    } catch (e) {
      console.error(e);
    }

    rules.forEach(async rule => {
      if (rule.created_at > body.date) {
        //console.log((rule.created_at - body.date) / 1000);
        return;
      }

      var this_text = message_text;

      if (rule.ping_roles && rule.ping_roles.length > 0) {
        var ping_text = "";
        for (var i = 0; i < rule.ping_roles.length; i++) {
          ping_text += "<@&" + rule.ping_roles[i] + "> ";
        }

        this_text = ping_text + this_text;
      }

      var properties = {
        type: body.type,
        account: account.account_id,
        star: account.star_id,
        site: body.site,
        broadcast_guid: body.broadcast_guid
      };

      var query = {
        type: body.type,
        site: body.site,
        broadcast_guid: body.broadcast_guid
      };

      if (rule.user) {
        query.user = rule.user;
        var already_messaged = await db_messages.find(query);
        if (already_messaged && already_messaged.length > 0) {
          return;
        }

        console.log("Notifying user " + rule.user + " of " + body.type + ": " + body.name + " (" + body.broadcast_guid + ")");

        var message = await senddm(rule.user, this_text + unsubscribe_msg, properties);
        message.react(unsubscribe_emoji);
      } else if (rule.guild && rule.channel) {
        query.guild = rule.guild;
        query.channel = rule.channel;
        var already_messaged = await db_messages.find(query);
        if (already_messaged && already_messaged.length > 0) {
          return;
        }

        console.log("Notifying channel " + rule.channel + " of " + body.type + ": " + body.name + " (" + body.broadcast_guid + ")");

        var message = await send_channel(rule.guild, rule.channel, this_text + subscribe_msg, properties);
        await message.react(subscribe_emoji);
        //await message.react(unsubscribe_emoji);
      }
    });
    return;
    lives_channel.send(message).then(
      async (message) => {
        await message.react(subscribe_emoji);
        await message.react(unsubscribe_emoji);
      },
      () => {
        console.error("Unable to send message");
      }
    );

    var users = get_subscribed_users(body);
    users.forEach(user => {
      senddm(user, message).then(
        message => {
          message.react(unsubscribe_emoji);
        },
        () => {
        }
      );
    });
  }
};

fastify.post('/add', (request, reply) => {
  try {

    //console.log(request.body);
    add_account(request.body).then(
      account => {
        if (request.body.type !== "account") {
          send_message(request.body);
        }
      }
    );

    reply.send({status: "ok"});
  } catch (err) {
    console.error(err);
    reply.send({status: "not_ok"});
  }
});

async function do_guild_white_blacklist(body) {
  if (!body || !body.guild_id || !body.type) {
    return;
  }

  if (body.type !== "whitelist" &&
      body.type !== "blacklist")
    return;

  var ok = body.type === "whitelist";

  var newobj = {
    ok
  };

  if (!ok) {
    newobj.reason = "admin_blacklist";
  } else {
    newobj.reason = "admin_whitelist";
  }

  var guilds = await db_guilds.find({guild_id: body.guild_id});
  //console.log(guilds);
  if (!guilds || guilds.length === 0) {
    var obj = {
      guild_id: body.guild_id
    };

    for (var prop in newobj) {
      obj[prop] = newobj[prop];
    }

    console.log("Inserting guild rule", obj);
    return db_guilds.insert(obj);
  } else {
    guilds.forEach(guild => {
      for (var prop in newobj) {
        guild[prop] = newobj[prop];
      }

      console.log("Updating guild rule", guild);
      db_guilds.update(guild._id, guild);
    });
  }
}

fastify.post('/guild', (request, reply) => {
  try {
    do_guild_white_blacklist(request.body);
    reply.send({status: "ok"});
  } catch (err) {
    console.error(err);
    reply.send({status: "not_ok"});
  }
});

async function do_delete(body) {
  if (!body || !body.type)
    return;

  if (body.type !== "message" || !body.message_type)
    return;

  if (!body.broadcast_guid)
    return;

  var messages = await db_messages.find({
    type: body.message_type,
    broadcast_guid: body.broadcast_guid
  });

  if (!body.confirm) {
    console.log(messages);
  } else {
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];

      try {
        var dmessage = null;

        if (message.guild) {
          var guild = client.guilds.get(message.guild);
          var channel = guild.channels.get(message.channel);
          dmessage = await channel.fetchMessage(message.messageid);
        } else if (message.user) {
          var user = await client.fetchUser(message.user);
          var channel = await user.createDM();
          dmessage = await channel.fetchMessage(message.messageid);
        }

        await dmessage.delete();
        console.log("Deleted " + message.messageid);
      } catch (err) {
        console.error(err);
        console.log("Failed to delete message:", message);
      }
    }
  }
}

fastify.post('/delete', (request, reply) => {
  try {
    do_delete(request.body);
    reply.send({status: "ok"});
  } catch (err) {
    console.error(err);
    reply.send({status: "not_ok"});
  }
});

fastify.listen(8456, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`server listening on ${fastify.server.address().port}`);
});

client.login(config.parsed.DISCORD_TOKEN);
