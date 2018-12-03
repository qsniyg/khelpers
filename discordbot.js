const config = require('dotenv').config();
const Discord = require("discord.js");
const client = new Discord.Client();
const fastify = require('fastify')();
const monk = require('monk');
var db = monk("localhost/live_discord?auto_reconnect=true");
var db_stars = db.get("stars");
var db_accounts = db.get("accounts");
var db_rules = db.get("rules");

if (false) {
  db_rules.find({}).then(
    rules => {
      console.log(rules);
    }
  );
}

var self_userid;

var subscribe_emoji = '✉';
var unsubscribe_emoji = '❌';

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

var users = {};

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

function do_subunsub(userid, account, subscribe) {
  var subscribed = is_subscribed(userid, account);
  if (subscribe && subscribed ||
      !subscribe && !subscribed)
    return;

  if (!(userid in users)) {
    users[userid] = {
      subbed_titles: [],
      subbed_accounts: [],
      //unsubbed_titles: [],
      //unsubbed_accounts: []
    };
  }

  var titles_list = users[userid].subbed_titles;
  var accounts_list = users[userid].subbed_accounts;
  var site_username = account.site + "/" + account.username;
  if (subscribe) {
    //titles_list = users[userid].unsubbed_titles;
    //accounts_list = users[userid].unsubbed_accounts;
    upush(titles_list, account.name);
    upush(accounts_list, site_username);
  } else {
    uremove(titles_list, account.name);
    uremove(accounts_list, site_username);
  }

  console.log(users[userid]);
}

function senddm(userid, text) {
  return new Promise((resolve, reject) => {
    client.fetchUser(userid).then(
      user => {
        user.send(text).then(
          message => resolve(message),
          error => reject(error)
        );
      },
      error => {
        console.error("Failed to find user " + userid);
        reject(error);
      }
    );
  });
}

function find_account(properties) {
  return new Promise((resolve, reject) => {
    if (("site" in properties) &&
        (("username" in properties) ||
         ("uid" in properties))) {
      var query = {
        site: properties.site
      };

      if ("username" in properties) {
        query.username = properties.username;
      } else if ("uid" in properties) {
        query.uid = properties.uid;
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
    .replace(/[-_'".,!\s]/g, "")
    .replace(/^\$+/, "");
}

function create_search(properties) {
  var search = [];

  if ("name" in properties) {
    search.push(properties.name);
  }

  if ("name_kr" in properties) {
    search.push(properties.name_kr);
  }

  if ("group" in properties && "member_name" in properties) {
    for (var i = 0; i < properties.group.length; i++) {
      search.push(properties.group[i] + " " + properties.member_name);
    }
  }

  if ("group_kr" in properties && "member_name_kr" in properties) {
    search.push(properties.group_kr + " " + properties.member_name_kr);
  }

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
      star_id: star.star_id
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
      star_id: id
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
    return rule[0];

  if (!options.rule_id) {
    options.rule_id = await create_rule_id();
  }

  console.log(options);
  var rule = await db_rules.insert(options);
  return rule;
}

function remove_rule(rule_id) {
  return db_rules.remove({rule_id: sanitize_id(rule_id)});
}

async function get_rules_for_account(account, replay) {
  var query = {
    "$or": [
      {star_id: sanitize_id(account.star_id)},
      {account_id: sanitize_id(account.account_id)},
      {all: true}
    ]
  };

  if (replay)
    query.replays = true;

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
    "$or": orquery
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

  await create_rule(options);

  senddm(userid, "Subscribed to **" + get_subscribe_name(account) + "**");
  return;

  if (is_subscribed(userid, account))
    return;

  do_subunsub(userid, account, true);
  senddm(userid, "Subscribed to **" + account.name + "**");
}

async function subscribe_channel(message, guild, channel_id, account, replays) {
  var options = base_rule(account, replays);
  options.guild = guild;
  options.channel = channel_id;

  await create_rule(options);

  if (message) {
    message.reply("Subscribed to **" + get_subscribe_name(account) + "**");
  }
}

async function unsubscribe(message, ruleid) {
  remove_rule(ruleid);

  if (message) {
    message.reply("Removed rule **" + ruleid + "**");
  }

  return;

  if (!is_subscribed(userid, account))
    return;

  do_subunsub(userid, account, false);
  senddm(userid, "Unsubscribed from **" + account.name + "**");
}

client.on('ready', () => {
  self_userid = client.user.id;

  console.log("Discord ready");
});

client.on('message', async message => {
  if (message.author.id === self_userid)
    return;

  var msg = message.content
      .replace(/^\s*/, "")
      .replace(/\s*$/, "");

  if (message.channel.type !== "dm" &&
      !msg.startsWith("<@" + self_userid + ">"))
    return;

  if (message.channel.type !== "dm" &&
      !message.member.roles.find("name", "LiveBotAdmin")) {
    message.reply("You need the `LiveBotAdmin` role to modify the bot's settings for the guild");
    return;
  }

  var is_user = message.channel.type === "dm";

  msg = msg.replace(/^<@[0-9]+>\s*/, "");

  console.log(msg);

  var newmsg = msg;
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
  var command = args[0];

  var youre = is_user ? "you are" : "your guild is";
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
      sample_args: "[group and member name] [replays]",
      shorthelp: "Subscribes yourself to a person's lives",
      longhelp: [
        "The group and member name needs to be quoted, but spacing, punctuation, and casing is ignored.",
        "",
        "If `replays` is true, it will also post when a replay is uploaded on Youtube.",
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
      sample_args: "[rule_id]",
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
    commands.subscribe.sample_args = "[channel_id] [group and member name] [replays]";
    commands.subscribe.shorthelp = "Subscribes a channel to a person's lives";
    commands.subscribe.longhelp = [
      "To find the `channel_id`, enable Developer Mode, right click on the channel, and select 'Copy ID'",
      "",
      "The group and member name needs to be quoted, but spacing, punctuation, and casing is ignored.",
      "",
      "If `replays` is true, it will also post when a replay is uploaded on Youtube.",
      "",
      "Examples:",
      "",
      "       `subscribe 123456 'snsd taeyeon' true`",
      "       `subscribe 123456 \"girl's generation taeyeon\" true`",
      "       `subscribe 123456 \"Girls Generation Taeyeon\" true`",
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
    message.reply(reply);
    break;
  case "subscribe":
    arglength = is_user ? 3 : 4;
    if (args.length !== arglength) {
      return message.reply("Needs " + arglength + " arguments (use the `help` command for more information)");
    }

    var replays = is_user ? args[2] : args[3];

    if (replays !== "true" &&
        replays !== "false") {
      return message.reply("The `replays` argument needs to be either `true` or `false`");
    }

    replays = replays === "true";

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
        return message.reply("Invalid `channel_id`");
      }

      if (!message.guild) {
        return message.reply("Not in a guild? You shouldn't see this");
      }

      if (!message.guild.channels.get(channel_id)) {
        return message.reply("Channel ID '" + channel_id + "' does not exist, or is not accessable by the bot");
      }
    }

    var star_search = is_user ? args[1] : args[2];

    var star;
    if (star_search === "*") {
      star = star_search;
    } else {
      star = await find_star({search: star_search});
      if (!star) {
        return message.reply("Unable to find `" + star_search + "`");
      }
    }

    if (is_user) {
      subscribe_user(message.author.id, star, replays);
    } else {
      subscribe_channel(message, message.guild.id, channel_id, star, replays);
    }
    break;
  case "unsubscribe":
    if (args.length !== 2) {
      return message.reply ("Needs `rule_id` (use the `help` command for more information)");
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
      return message.reply("Invalid `rule_id`");
    }

    var rule = await db_rules.find({rule: rule_id});
    if (!rule) {
      return message.reply("Rule " + rule_id + " does not exist");
    }

    unsubscribe(message, rule_id);
    break;
  case "list":
    console.log("OK");
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
        if (!guild) {
          channel_name = "undefined guild";
        } else {
          var channel = guild.channels.get(rule.channel);
          if (!channel) {
            channel_name = "undefined channel";
          } else {
            channel_name = channel.name;
          }
        }

        text += " on `" + channel_name + "`";
      }

      message_text += text + "\n";
    }

    message.reply(message_text);
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

    var user = client.users.get(event.d.user_id);
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

          var parsed = parse_msg(message.content);
          console.log(parsed);

          var account = await find_account(parsed);
          if (!account)
            return;

          var star = await find_star(parsed);

          console.log(account);
          if (event.d.emoji.name === subscribe_emoji) {
            if (star)
              subscribe_user(event.d.user_id, star, true);
            else
              subscribe_user(event.d.user_id, account, true);
            //console.log("sub");
          } else if (event.d.emoji.name === unsubscribe_emoji) {
            //unsubscribe(event.d.user_id, parsed);
            var rules = await get_rules_for_user_account(event.d.user_id, account);
            if (rules && rules.length > 0) {
              rules.forEach(rule => {
                remove_rule(rule.rule_id);
              });
              senddm(event.d.user_id, "Unsubscribed from **" + parsed.name + "**");
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

async function send_message(body) {
  if (body.type === "live") {
    var sitename = "";
    switch (body.site) {
    case "instagram":
      sitename = "Instagram";
      break;
    case "periscope":
      sitename = "Periscope";
      break;
    }

    var noupload_msg = "";
    if (true) {
      if (body.noupload || body.group_noupload) {
        noupload_msg = " *(will likely not be uploaded)*";
      }
    }

    var message_text = "**" + body.name + "** is live on " + sitename + noupload_msg + "\n" + body.watch_link + "\n\n";
    var subscribe_msg = "*Use " + subscribe_emoji + " to subscribe to future lives by this person*";
    var unsubscribe_msg = "*Use " + unsubscribe_emoji + " to unsubscribe from future lives by this person*";

    var account = await find_account(body);
    var rules = await get_rules_for_account(account, false);

    rules.forEach(async rule => {
      if (rule.user) {
        var message = await senddm(rule.user, message_text + unsubscribe_msg);
        message.react(unsubscribe_emoji);
      } else if (rule.guild && rule.channel) {
        var guild = client.guilds.get(rule.guild);
        if (!guild) {
          return;
        }

        var channel = guild.channels.get(rule.channel);
        if (!channel) {
          return;
        }

        var message = await channel.send(message_text + subscribe_msg);
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
        send_message(request.body);
        return;
        find_star_by_id(account.star_id).then(
          star => {
            console.log(star);
          }
        );
        get_star_accounts(account.star_id).then(
          accounts => {
            console.log(accounts);
          }
        );
      }
    );

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
