import "dotenv/config";
import axios from "axios";
import readline from "readline";
import { OpenAI } from "openai";
import { exec } from "child_process";

const openai = new OpenAI();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function scrapeWebsite(url: string) {
  const { scrapeWebsite } = await import("./scrapeWebsite");
  return await scrapeWebsite(url, {
    outDir: "./output",
    mirrorExternalAssets: true,
    // maxPages: 50,
  });
}

async function getWeatherDetailsByCity(cityName: string) {
  const url = `https://wttr.in/${cityName.toLowerCase()}?format=%C+%t`;
  const { data } = await axios.get(url, { responseType: "json" });
  return `The current weather for ${cityName} is ${data}`;
}

async function getGithubUserInfoByUsername(userName: string) {
  const url = `https://api.github.com/users/${userName.toLowerCase()}`;

  const { data } = await axios.get(url, { responseType: "json" });
  return JSON.stringify({
    login: data.login,
    id: data.id,
    name: data.name,
    location: data.location,
    twitter_username: data.twitter_username,
    public_repos: data.public_repos,
    public_gists: data.public_gists,
    user_view_type: data.user_view_type,
    followers: data.followers,
    following: data.following,
  });
}

async function executeCommand(cmd: string) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err: Error | null, data: string) => {
      if (err) reject(err.message);
      else resolve(data);
    });
  });
}

const TOOL_MAP = {
  getWeatherDetailsByCity: getWeatherDetailsByCity,
  getGithubUserInfoByUsername: getGithubUserInfoByUsername,
  executeCommand: executeCommand,
  scrapeWebsite: scrapeWebsite,
};

async function main() {
  const userPrompt = await askQuestion("💡 Enter the website URL: ");
  rl.close();

  const SYSTEM_PROMPT = `
    You are an AI assistant who works on START, THINK and OUTPUT format.
    For a given user query first think and breakdown the problem into sub problems.
    You should always keep thinking and thinking before giving the actual output.
    
    Also, before outputing the final result to user you must check once if everything is correct.
    You also have list of available tools that you can call based on user query.
    
    For every tool call that you make, wait for the OBSERVATION from the tool which is the
    response from the tool that you called.

    Available Tools:
    - getWeatherDetailsByCity(cityName: string): Returns the current weather data of the city.
    - getGithubUserInfoByUsername(userName: string): Retuns the public info about the github user using github api
    - executeCommand(command: string): Takes a linux / unix command as arg and executes the command on user's machine and returns the output
    - scrapeWebsite(url: string): Clones the website at the given URL into a fully functional offline version.

    Rules:
    - Strictly follow the output JSON format
    - Always follow the output in sequence that is START, THINK, OBSERVE and OUTPUT.
    - Always perform only one step at a time and wait for other step.
    - Alway make sure to do multiple steps of thinking before giving out output.
    - For every tool call always wait for the OBSERVE which contains the output from tool

    Output JSON Format:
    { "step": "START | THINK | OUTPUT | OBSERVE | TOOL" , "content": "string", "tool_name": "string", "input": "string" }

    Example_1:
    User: Hey, can you tell me weather of Patiala?
    ASSISTANT: { "step": "START", "content": "The user is intertested in the current weather details about Patiala" } 
    ASSISTANT: { "step": "THINK", "content": "Let me see if there is any available tool for this query" } 
    ASSISTANT: { "step": "THINK", "content": "I see that there is a tool available getWeatherDetailsByCity which returns current weather data" } 
    ASSISTANT: { "step": "THINK", "content": "I need to call getWeatherDetailsByCity for city patiala to get weather details" }
    ASSISTANT: { "step": "TOOL", "input": "patiala", "tool_name": "getWeatherDetailsByCity" }
    DEVELOPER: { "step": "OBSERVE", "content": "The weather of patiala is cloudy with 27 Cel" }
    ASSISTANT: { "step": "THINK", "content": "Great, I got the weather details of Patiala" }
    ASSISTANT: { "step": "OUTPUT", "content": "The weather in Patiala is 27 C with little cloud. Please make sure to carry an umbrella with you. ☔️" }

    Example_2:
    User: Can you give me the Github details for a userName Vikastc?
    ASSISTANT: {"step": "START", "content": "The user wants me to fetch the publically available github profile from the given username" }
    ASSISTANT: {"step": "THINK", "content": "Let me see if there is any tool available i can use?" }
    ASSISTANT: {"step": "THINK", "content": "I can use the tool getGithubUserInfoByUsername() to fetch the requested data" }
    ASSISTANT: {"step": "TOOL", "tool_name":"getGithubUserInfoByUsername", "input": "Vikastc"}
    DEVELOPER: {"step": "OBSERVE", 
    "content": "
        {
            "login": "Vikastc",
            "id": 113993198,
            "node_id": "U_kgDOBstl7g",
            "avatar_url": "https://avatars.githubusercontent.com/u/113993198?v=4",
            "gravatar_id": "",
            "type": "User",
            "user_view_type": "public",
            "site_admin": false,
            "name": "Vikas TC",
            "company": "Dhiway",
            "blog": "",
            "location": "Bangalore",
            "email": null,
            "hireable": null,
            "bio": "Software engineer @Dhiway, passionate about backend development, web3 and open source. 🌟",
            "twitter_username": null,
            "public_repos": 36,
            "public_gists": 0,
            "followers": 4,
            "following": 6,
            "created_at": "2022-09-20T12:17:27Z",
            "updated_at": "2025-07-09T06:39:15Z"
        }
        "
    }
    ASSISTANT: { "step": "THINK", "content": "Great i got the data now lets send what is required" }
    ASSISTANT: {"step": "OUTPUT", "content": "
        {
            "login": "Vikastc",
            "id": 113993198,
            "type": "User",
            "user_view_type": "public",
            "name": "Vikas TC",
            "location": "Bangalore",
            "email": null,
            "bio": "Software engineer @Dhiway, passionate about backend development, web3 and open source. 🌟",
            "twitter_username": null,
            "public_repos": 36,
            "public_gists": 0,
            "followers": 4,
            "following": 6,
            "created_at": "2022-09-20T12:17:27Z",
            "updated_at": "2025-07-09T06:39:15Z"
        }
    }

  Example_3:
    User: Given a website "https://www.piyushgarg.dev" Can you clone the entire site (HTML, CSS, JS) locally using plain HTML/CSS/JS ?
    ASSISTANT: { "step": "START", "content": "The user wants to clone the entire website 'https://www.piyushgarg.dev' locally" }
    ASSISTANT: { "step": "THINK", "content": "Let me see if there is any available tool for this query" }
    ASSISTANT: { "step": "THINK", "content": "I see that there is a tool available scrapeWebsite() which can be used to clone the website" }
    ASSISTANT: { "step": "THINK", "content": "I need to call scrapeWebsite() for url https://www.piyushgarg.dev to clone the website" }
    ASSISTANT: { "step": "TOOL", "input": "https://www.piyushgarg.dev", "tool_name": "scrapeWebsite" }
    ASSISTANT: { "step": "THINK", "content": " Download and save the entire site locally, including HTML, CSS, JavaScript, images, and fonts." }
    ASSISTANT: { "step": "THINK", "content": "Rewrite all external links and code so the site runs completely offline without dependencies on external CDNs or APIs." }
    ASSISTANT: { "step": "THINK", "content": "Clone the website into a fully functional offline version using plain HTML/CSS/JS with responsive layout, closely matching the original design, and organize assets in a clean directory structure (/css, /js, /images, etc.)."}
    DEVELOPER: { "step": "OBSERVE", "content": "If you face any errors, try checking the console for more information. And retry the operation."}
    DEVELOPER: { "step": "OBSERVE", "content": "The website https://www.piyushgarg.dev has been cloned successfully" }
    ASSISTANT: { "step": "THINK", "content": "Double check if the website is cloned correctly" }
    ASSISTANT: { "step": "THINK", "content": "Check if all the images are loaded correctly, if not try re-downloading them and fixing the paths." }
    ASSISTANT: { "step": "THINK", "content": "Add the website in a new folder 'cloned-sites'" }
    ASSISTANT: { "step": "THINK", "content": "Double check if the website is accessible locally" }
    ASSISTANT: { "step": "OUTPUT", "content": "Check if all the pages are accessible and images are loading correctly. Scrape all sub pages as well." }
    ASSISTANT: { "step": "THINK", "content": "Test the website in the browser" }
    ASSISTANT: { "step": "THINK", "content": "Check the console for any errors" }
    ASSISTANT: { "step": "THINK", "content": "Fix any errors that come up" }
    ASSISTANT: { "step": "THINK", "content": "Give the user the command to run the app locally" }
    ASSISTANT: { "step": "OUTPUT", "content": "The website 'https://www.piyushgarg.dev' has been cloned successfully and is available locally." }
  `;

  const messages: Array<{
    role: "system" | "user" | "assistant" | "developer";
    content: string;
  }> = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `Clone the website ${userPrompt} into a fully functional offline version. Rewrite all code, assets,
       and links so it runs locally without internet access.`,
    },
  ];

  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: messages,
    });

    const rawContent = response.choices[0].message.content;
    const parsedContent = JSON.parse(rawContent as string);

    messages.push({
      role: "assistant",
      content: JSON.stringify(parsedContent),
    });

    if (parsedContent.step === "START") {
      console.log(`🤖`, parsedContent.content);
      continue;
    }

    if (parsedContent.step === "THINK") {
      console.log(`🤖`, parsedContent.content);
      continue;
    }

    try {
      if (parsedContent.step === "TOOL") {
        const toolKey = parsedContent.tool_name as keyof typeof TOOL_MAP;
        if (!TOOL_MAP[toolKey]) {
          messages.push({
            role: "developer",
            content: "There is no tool available for users request",
          });
          continue;
        }

        const res = await TOOL_MAP[toolKey](parsedContent.input);
        console.log(
          `🛠️ ${toolKey} for ${parsedContent.input} gave output ${res}`
        );

        messages.push({
          role: "developer",
          content: JSON.stringify({ step: "OBSERVE", content: res }),
        });

        continue;
      }
    } catch (error) {
      console.error(
        `⚠️ Error occurred while processing ${parsedContent.input}:`,
        error
      );
      messages.push({
        role: "developer",
        content: JSON.stringify({
          step: "OBSERVE",
          content:
            typeof error === "object" && error !== null && "message" in error
              ? (error as { message: string }).message
              : String(error),
        }),
      });
    }

    if (parsedContent.step === "OUTPUT") {
      console.log(`🤖`, parsedContent.content);
      break;
    }
  }
  console.log("\n ...DONE 👍");
}

main();
