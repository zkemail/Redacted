const HomeHeader = () => {
    return (
        <div className='fixed top-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-50 bg-lighter/80 backdrop-blur w-[80%] sm:w-[54%]'>
            <div className='flex justify-between items-center h-full text-black p-0 m-0'>
                <div className='flex gap-2 sm:gap-4 pl-2 sm:pl-4 py-2 sm:py-2.5'>
                    <img src='logo-sm.svg' alt="Whistleblow logo" className="w-5 h-auto sm:w-6"/> 
                    <span className='text-sm sm:text-base'>
                        whistleblow
                    </span>
                </div>
                <div className='flex flex-row gap-2 sm:gap-4 justify-center items-center'>
                    <a
                        href="/verify"
                        className="text-xs sm:text-base"
                    >
                        Verify
                    </a>
                    <a
                        href="/app"
                        className="bg-black text-white px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base"
                    >
                        Prove an email
                    </a>
                </div>
            </div>
        </div>
    )
}

export default HomeHeader