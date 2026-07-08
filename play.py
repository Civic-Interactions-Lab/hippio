import os
import subprocess
import time
import signal
import sys

'''
AI Generated automation script for playtesting the Hungry Hippo Game that starts the API server, 
game client server, opens and positions 4 browser windows for the host, aac user, 
and two hippo players, and navigates them to the appropriate pages in the game.

'''

# Ensure Playwright for Python is available
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Playwright for Python not found. Installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    from playwright.sync_api import sync_playwright

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    game_dir = os.path.join(script_dir, "Hungry-Hippo-Game")
    
    if not os.path.exists(game_dir):
        print(f"Error: Could not find '{game_dir}'. Make sure this script is adjacent to the Hungry-Hippo-Game directory.")
        sys.exit(1)
        
    os.chdir(game_dir)
    
    print("Running npm install in the project folder...")
    subprocess.run(["npm", "install"], check=True)
    # The instructions specifically requested installing playwright via NPM in the project
    subprocess.run(["npm", "install", "--no-save", "playwright"], check=True)
    
    print("Installing playwright browsers...")
    subprocess.run(["npx", "playwright", "install"], check=True)
    # Ensure the python bindings also have their specific browser binaries installed
    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
    
    print("Starting API server...")
    api_proc = subprocess.Popen(["npm", "run", "api"])
    
    print("Starting Game Client server...")
    client_proc = subprocess.Popen(["npm", "run", "dev"])
    
    def cleanup(signum=None, frame=None):
        print("\nKilling subprocesses...")
        api_proc.terminate()
        client_proc.terminate()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)
    
    # # Wait for the vite server and api server to be fully ready
    # print("Waiting for servers to initialize (1 second)...")
    # time.sleep(1)
    
    try:
        with sync_playwright() as p:
            # We open 4 browser instances with different window positions so they tile
            # and don't block each other.
            
            # 1. Host / Presenter window (Top Left)
            b_host = p.chromium.launch(headless=False, args=['--window-position=0,0', '--window-size=600,800'])
            c_host = b_host.new_context(viewport={'width': 600, 'height': 800})
            page_host = c_host.new_page()
            
            # 2. AAC User window (Top Right)
            b_aac = p.chromium.launch(headless=False, args=['--window-position=600,0', '--window-size=600,800'])
            c_aac = b_aac.new_context(viewport={'width': 600, 'height': 800})
            page_aac = c_aac.new_page()
            
            # 3. Hippo 1 window (Bottom Left)
            b_h1 = p.chromium.launch(headless=False, args=['--window-position=0,800', '--window-size=600,800'])
            c_h1 = b_h1.new_context(viewport={'width': 600, 'height': 800})
            page_h1 = c_h1.new_page()
            
            # 4. Hippo 2 window (Bottom Right)
            b_h2 = p.chromium.launch(headless=False, args=['--window-position=600,800', '--window-size=600,800'])
            c_h2 = b_h2.new_context(viewport={'width': 600, 'height': 800})
            page_h2 = c_h2.new_page()

            print("Setting up the Host...")
            page_host.goto("http://localhost:3000/")
            page_host.get_by_text("No code? Create new game!").click()
            page_host.wait_for_url("**/presenter/*")
            page_host.get_by_role("button", name="Next mode").click()
            page_host.get_by_role("button", name="Next mode").click()
            
            session_id = page_host.url.split("/")[-1]
            print(f"Session ID created: {session_id}")
            
            time.sleep(1) # Small buffer for the session creation to fully propagate
            
            print("Setting up AAC User...")
            page_aac.goto(f"http://localhost:3000/roleselect/{session_id}")
            page_aac.locator("button", has_text="AAC User").click()
            page_aac.locator("button", has_text="Next").click()
            
            print("Setting up Hippo Player 1...")
            page_h1.goto(f"http://localhost:3000/roleselect/{session_id}")
            page_h1.locator("button", has_text="Hippo Player").click()
            page_h1.get_by_alt_text("brown").click()
            page_h1.locator("button", has_text="Next").click()
            
            print("Setting up Hippo Player 2...")
            page_h2.goto(f"http://localhost:3000/roleselect/{session_id}")
            page_h2.locator("button", has_text="Hippo Player").click()
            page_h2.get_by_alt_text("red").click()
            page_h2.locator("button", has_text="Next").click()
            
            print("Starting the game from the Host interface...")
            page_host.bring_to_front()
            # time.sleep(1) # Allow all players to appear in the lobby correctly before clicking start
            # page_host.locator("button", has_text="Start Game").click()
            
            # print("Game started! Press Ctrl+C in this terminal to kill the servers and browsers.")
            # # Block the script from exiting until killed
            while True:
                time.sleep(1)
                
    except Exception as e:
        print(f"An error occurred during Playwright automation: {e}")
        cleanup()

if __name__ == "__main__":
    main()
